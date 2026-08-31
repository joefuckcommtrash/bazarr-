# coding=utf-8

"""Direct OpenAI-compatible subtitle translation (no middleware required)."""

import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from app.config import settings
from app.event_handler import show_progress
from app.jobs_queue import jobs_queue

from .openrouter_translator import OpenRouterTranslatorService

logger = logging.getLogger(__name__)


class OpenAICompatibleTranslatorService(OpenRouterTranslatorService):
    """Translate through OpenAI, Vultr, Ollama, or another compatible API."""

    translator_name = "OpenAI-Compatible AI"

    @staticmethod
    def _profile():
        profiles = list(getattr(settings.translator, 'ai_profiles', []) or [])
        active_id = str(getattr(settings.translator, 'ai_active_profile', '') or '')
        profile = next(
            (item for item in profiles if isinstance(item, dict) and str(item.get('id')) == active_id),
            profiles[0] if profiles else {},
        )
        keys = list(getattr(settings.translator, 'ai_profile_keys', []) or [])
        prefix = f"{profile.get('id', active_id)}:"
        api_key = next((item[len(prefix):] for item in keys if isinstance(item, str) and item.startswith(prefix)), '')
        return {
            'url': profile.get('url') or settings.translator.ai_url,
            'api_key': api_key or settings.translator.ai_api_key,
            'model': profile.get('model') or settings.translator.ai_model,
            'temperature': profile.get('temperature', settings.translator.ai_temperature),
            'batch_size': int(profile.get('batch_size', settings.translator.ai_batch_size)),
            'max_concurrent': int(profile.get('max_concurrent', settings.translator.ai_max_concurrent)),
            'timeout': int(profile.get('timeout', settings.translator.ai_timeout)),
            'reasoning': profile.get('reasoning') or settings.translator.ai_reasoning,
            'name': profile.get('name') or 'Default',
        }

    @staticmethod
    def _extract_translations(content):
        text = str(content or '').strip()
        fenced = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.DOTALL | re.IGNORECASE)
        if fenced:
            text = fenced.group(1)
        start = text.find('[')
        end = text.rfind(']')
        if start < 0 or end < start:
            raise ValueError('Model response does not contain a JSON array')
        data = json.loads(text[start:end + 1])
        if not isinstance(data, list):
            raise ValueError('Model response is not a JSON array')
        result = []
        for item in data:
            if not isinstance(item, dict) or 'position' not in item or 'line' not in item:
                raise ValueError('Model returned an invalid subtitle entry')
            result.append({'position': int(item['position']), 'line': str(item['line'])})
        return result

    @staticmethod
    def _endpoint():
        base = OpenAICompatibleTranslatorService._profile()['url'].rstrip('/')
        return base if base.endswith('/chat/completions') else f'{base}/chat/completions'

    def _translate_batch(self, batch, source_language, target_language, title):
        profile = self._profile()
        system_prompt = (
            f'Translate subtitle dialogue from {source_language} to {target_language}. '
            'Preserve meaning, tone, names, line breaks, and subtitle brevity. '
            'Return only a JSON array. Each item must contain the original integer '
            '"position" and its translated string "line". Do not omit or merge entries.'
        )
        if title:
            system_prompt += f' The media title is {title}.'

        payload = {
            'model': profile['model'],
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': json.dumps(batch, ensure_ascii=False)},
            ],
            'temperature': profile['temperature'],
        }
        reasoning = profile['reasoning']
        if reasoning != 'disabled':
            payload['reasoning_effort'] = reasoning

        headers = {'Content-Type': 'application/json'}
        api_key = str(profile['api_key']).strip()
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'

        last_error = None
        for attempt in range(3):
            try:
                response = requests.post(
                    self._endpoint(), json=payload, headers=headers,
                    timeout=profile['timeout'],
                )
                if response.status_code == 429 or response.status_code >= 500:
                    response.raise_for_status()
                if response.status_code >= 400:
                    raise RuntimeError(f'API returned {response.status_code}: {response.text[:500]}')
                data = response.json()
                choices = data.get('choices') or []
                if not choices:
                    raise ValueError('API response contains no choices')
                translated = self._extract_translations(
                    choices[0].get('message', {}).get('content', '')
                )
                expected = {item['position'] for item in batch}
                actual = {item['position'] for item in translated}
                if actual != expected:
                    raise ValueError(
                        f'Model returned positions {sorted(actual)}; expected {sorted(expected)}'
                    )
                usage = data.get('usage') or {}
                logger.info(
                    'AI translation call model=%s provider=%s prompt_tokens=%s '
                    'completion_tokens=%s total_tokens=%s request_id=%s',
                    profile['model'], profile['name'],
                    usage.get('prompt_tokens'), usage.get('completion_tokens'),
                    usage.get('total_tokens'),
                    response.headers.get('x-request-id') or response.headers.get('request-id'),
                )
                return translated
            except (requests.RequestException, ValueError, RuntimeError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f'AI translation batch failed: {last_error}')

    def _submit_and_poll(self, lines_list, bazarr_job_id=None):
        source_language = self.language_code_convert_dict.get(self.from_lang, self.from_lang)
        target_language = self.language_code_convert_dict.get(self.orig_to_lang, self.orig_to_lang)
        lines = [{'position': index, 'line': line} for index, line in enumerate(lines_list)]
        profile = self._profile()
        size = profile['batch_size']
        batches = [lines[index:index + size] for index in range(0, len(lines), size)]
        title = self.video_path.rsplit('/', 1)[-1]
        completed = 0
        translated = []

        with ThreadPoolExecutor(max_workers=profile['max_concurrent']) as executor:
            futures = {
                executor.submit(
                    self._translate_batch, batch, source_language, target_language, title
                ): batch for batch in batches
            }
            for future in as_completed(futures):
                result = future.result()
                translated.extend(result)
                completed += 1
                progress = int(completed * 100 / len(batches))
                show_progress(
                    id=f'translate_progress_{self.dest_srt_file}',
                    header='Translating subtitles with AI...',
                    name=f'{completed}/{len(batches)} batches [{profile["model"]}]',
                    value=progress,
                    count=100,
                )
                if bazarr_job_id:
                    jobs_queue.update_job_progress(
                        job_id=bazarr_job_id,
                        progress_value=progress,
                        progress_max=100,
                        progress_message=f'{completed}/{len(batches)} batches [{profile["model"]}]',
                    )

        return sorted(translated, key=lambda item: item['position'])
