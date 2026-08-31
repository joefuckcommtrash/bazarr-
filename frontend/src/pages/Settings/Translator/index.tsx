/* eslint-disable camelcase */
import { FunctionComponent, useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select as MantineSelect,
  SimpleGrid,
  Stack,
  Text as MantineText,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  faCircleInfo,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AxiosError } from "axios";
import {
  useDirectTranslatorModels,
  useTestTranslator,
} from "@/apis/hooks/translator";
import { TranslatorStatusPanelWithFormContext } from "@/components/TranslatorStatus";
import {
  Check,
  Chips,
  CollapseBox,
  Layout,
  Message,
  Number,
  Password,
  Section,
  Selector,
  Slider,
  Text,
} from "@/pages/Settings/components";
import { useFormActions } from "@/pages/Settings/utilities/FormValues";
import { useSettingValue } from "@/pages/Settings/utilities/hooks";
import AIModelSelector from "./AIModelSelector";
import ModelDetailsCard, { useOpenRouterModelDetails } from "./ModelDetails";
import {
  aiTranslatorConcurrentOptions,
  aiTranslatorParallelBatchesOptions,
  aiTranslatorReasoningOptions,
} from "./options";

const engineOptions = [
  { value: "openai_compatible", label: "Common AI (Direct API)" },
  { value: "openrouter", label: "AI Subtitle Translator (Middleware)" },
  { value: "google_translate", label: "Google Translate" },
  { value: "gemini", label: "Gemini" },
  { value: "lingarr", label: "Lingarr" },
];

const TranslatorEnginePicker: FunctionComponent = () => {
  return (
    <Selector
      label="Translator Engine"
      options={engineOptions}
      settingKey="settings-translator-translator_type"
    />
  );
};

const FreeModelWarning: FunctionComponent = () => {
  const modelId = useSettingValue<string>(
    "settings-translator-openrouter_model",
  );
  if (!modelId) return null;
  const isFree =
    modelId === "openrouter/free" ||
    modelId.endsWith(":free") ||
    modelId.includes("/free");
  if (!isFree) return null;

  return (
    <Alert
      color="yellow"
      variant="light"
      icon={<FontAwesomeIcon icon={faExclamationTriangle} />}
      p="xs"
    >
      <MantineText size="xs">
        Free models are heavily rate-limited by their upstream providers. Expect
        slow translations, frequent retries, and possible job failures. Use a
        paid model for reliable results.
      </MantineText>
    </Alert>
  );
};

const ReasoningSelector: FunctionComponent = () => {
  const modelId = useSettingValue<string>(
    "settings-translator-openrouter_model",
  );
  const { data: model, isLoading } = useOpenRouterModelDetails(modelId ?? "");
  const modelLoaded = !!model && !isLoading;
  const supportsReasoning =
    model?.supported_parameters?.includes("reasoning") ?? false;
  const { setValue } = useFormActions();

  // Only auto-disable after model data has loaded, not while loading
  const currentReasoning = useSettingValue<string>(
    "settings-translator-openrouter_reasoning",
  );
  useEffect(() => {
    if (
      modelLoaded &&
      !supportsReasoning &&
      currentReasoning &&
      currentReasoning !== "disabled"
    ) {
      setValue("disabled", "settings-translator-openrouter_reasoning");
    }
  }, [modelLoaded, supportsReasoning, currentReasoning, setValue]);

  return (
    <Selector
      label="Reasoning Mode"
      options={aiTranslatorReasoningOptions}
      settingKey="settings-translator-openrouter_reasoning"
      disabled={modelLoaded && !supportsReasoning}
    />
  );
};

const ModelDetailsFromSetting: FunctionComponent = () => {
  const modelId = useSettingValue<string>(
    "settings-translator-openrouter_model",
  );
  const reasoningLevel = useSettingValue<string>(
    "settings-translator-openrouter_reasoning",
  );
  if (!modelId) return null;
  return (
    <ModelDetailsCard
      modelId={modelId}
      reasoningLevel={reasoningLevel ?? "disabled"}
    />
  );
};

interface DirectTestConfig {
  url: string;
  apiKey: string;
  model: string;
}

const TestConnectionButton: FunctionComponent<{
  directConfig?: DirectTestConfig;
}> = ({ directConfig }) => {
  const testMutation = useTestTranslator();
  const translatorType = useSettingValue<string>(
    "settings-translator-translator_type",
  );
  const middlewareUrl = useSettingValue<string>(
    "settings-translator-openrouter_url",
  );
  const middlewareApiKey = useSettingValue<string>(
    "settings-translator-openrouter_api_key",
  );
  const directUrl = useSettingValue<string>("settings-translator-ai_url");
  const directApiKey = useSettingValue<string>(
    "settings-translator-ai_api_key",
  );
  const directModel = useSettingValue<string>("settings-translator-ai_model");
  const encryptionKey = useSettingValue<string>(
    "settings-translator-openrouter_encryption_key",
  );
  const direct =
    directConfig !== undefined || translatorType === "openai_compatible";
  const serviceUrl = directConfig?.url ?? (direct ? directUrl : middlewareUrl);
  const apiKey =
    directConfig?.apiKey ?? (direct ? directApiKey : middlewareApiKey);
  const model = directConfig?.model ?? directModel;

  const handleTest = () => {
    testMutation.mutate(
      {
        serviceUrl: serviceUrl ?? undefined,
        apiKey: apiKey ?? undefined,
        encryptionKey: direct ? undefined : (encryptionKey ?? undefined),
        direct,
        model: model ?? undefined,
      },
      {
        onSuccess: (data) => {
          if (data.error) {
            notifications.show({
              title: "Connection Failed",
              message: data.error,
              color: "red",
            });
            return;
          }
          if (data.encryption) {
            const encOk = data.encryption.status === "ok";
            notifications.show({
              title: encOk ? "Encryption" : "Encryption Failed",
              message: data.encryption.message,
              color: encOk ? "green" : "red",
            });
          }
          if (data.apiKey) {
            const keyOk = data.apiKey.status === "ok";
            notifications.show({
              title: keyOk ? "API Key" : "API Key Failed",
              message: keyOk
                ? `${data.apiKey.label}${data.apiKey.isFreeTier ? " (Free tier)" : ""}`
                : "API key validation failed",
              color: keyOk ? "green" : "red",
            });
          }
          if (!data.encryption && !data.apiKey) {
            notifications.show({
              title: "Connected",
              message: "Service reachable",
              color: "green",
            });
          }
        },
        onError: (error) => {
          const apiMessage =
            error instanceof AxiosError
              ? (error.response?.data as { error?: string } | undefined)?.error
              : undefined;
          notifications.show({
            title: "Connection Failed",
            message: apiMessage ?? "Could not reach the translator service",
            color: "red",
          });
        },
      },
    );
  };

  return (
    <Button
      variant="default"
      size="xs"
      onClick={handleTest}
      loading={testMutation.isPending}
      disabled={!serviceUrl || (!direct && !apiKey)}
    >
      Test Connection
    </Button>
  );
};

interface AIProfile {
  id: string;
  name: string;
  url: string;
  model: string;
  temperature: number;
  batch_size: number;
  max_concurrent: number;
  timeout: number;
  reasoning: string;
}

const AIProfilesEditor: FunctionComponent = () => {
  const profiles =
    useSettingValue<AIProfile[]>("settings-translator-ai_profiles") ?? [];
  const profileKeys =
    useSettingValue<string[]>("settings-translator-ai_profile_keys") ?? [];
  const configuredActiveId = useSettingValue<string>(
    "settings-translator-ai_active_profile",
  );
  const { setValue } = useFormActions();
  const modelsMutation = useDirectTranslatorModels();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const activeProfile =
    profiles.find((profile) => profile.id === configuredActiveId) ??
    profiles[0];

  useEffect(() => {
    setAvailableModels([]);
  }, [activeProfile?.id]);

  if (!activeProfile) {
    return (
      <Message>Save or reload settings to initialize an AI profile.</Message>
    );
  }

  const keyPrefix = `${activeProfile.id}:`;
  const apiKey =
    profileKeys
      .find((entry) => entry.startsWith(keyPrefix))
      ?.slice(keyPrefix.length) ?? "";

  const updateProfiles = (nextProfiles: AIProfile[]) =>
    setValue(nextProfiles, "settings-translator-ai_profiles");
  const updateProfile = (changes: Partial<AIProfile>) =>
    updateProfiles(
      profiles.map((profile) =>
        profile.id === activeProfile.id ? { ...profile, ...changes } : profile,
      ),
    );
  const updateApiKey = (value: string) => {
    const remaining = profileKeys.filter(
      (entry) => !entry.startsWith(keyPrefix),
    );
    setValue(
      value ? [...remaining, `${activeProfile.id}:${value}`] : remaining,
      "settings-translator-ai_profile_keys",
    );
  };
  const newId = () =>
    globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}`;
  const addProfile = (duplicate: boolean) => {
    const id = newId();
    const profile: AIProfile = duplicate
      ? { ...activeProfile, id, name: `${activeProfile.name} Copy` }
      : {
          id,
          name: "New Profile",
          url: "http://localhost:11434/v1",
          model: "",
          temperature: 0.2,
          batch_size: 100,
          max_concurrent: 1,
          timeout: 180,
          reasoning: "disabled",
        };
    updateProfiles([...profiles, profile]);
    if (duplicate && apiKey) {
      setValue(
        [...profileKeys, `${id}:${apiKey}`],
        "settings-translator-ai_profile_keys",
      );
    }
    setValue(id, "settings-translator-ai_active_profile");
  };
  const deleteProfile = () => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter(
      (profile) => profile.id !== activeProfile.id,
    );
    updateProfiles(remaining);
    setValue(
      profileKeys.filter((entry) => !entry.startsWith(keyPrefix)),
      "settings-translator-ai_profile_keys",
    );
    setValue(remaining[0].id, "settings-translator-ai_active_profile");
  };
  const fetchModels = () => {
    modelsMutation.mutate(
      { serviceUrl: activeProfile.url, apiKey: apiKey || undefined },
      {
        onSuccess: ({ models }) => {
          setAvailableModels(
            Array.from(
              new Set([activeProfile.model, ...models].filter(Boolean)),
            ),
          );
          notifications.show({
            title: "Models Loaded",
            message: `Found ${models.length} model${models.length === 1 ? "" : "s"}`,
            color: "green",
          });
        },
        onError: (error) => {
          const apiMessage =
            error instanceof AxiosError
              ? (error.response?.data as { error?: string } | undefined)?.error
              : undefined;
          notifications.show({
            title: "Could Not Fetch Models",
            message:
              apiMessage ??
              (error instanceof Error ? error.message : "Model request failed"),
            color: "red",
          });
        },
      },
    );
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <Group align="end" wrap="wrap">
          <MantineSelect
            label="Active AI Profile"
            data={profiles.map((profile) => ({
              value: profile.id,
              label: profile.name,
            }))}
            value={activeProfile.id}
            onChange={(value) =>
              value && setValue(value, "settings-translator-ai_active_profile")
            }
            allowDeselect={false}
            flex={1}
          />
          <Button
            type="button"
            variant="light"
            onClick={() => addProfile(false)}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="light"
            onClick={() => addProfile(true)}
          >
            Duplicate
          </Button>
          <Button
            type="button"
            color="red"
            variant="subtle"
            disabled={profiles.length <= 1}
            onClick={deleteProfile}
          >
            Delete
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Profile Name"
            value={activeProfile.name}
            onChange={(event) =>
              updateProfile({ name: event.currentTarget.value })
            }
          />
          <TextInput
            label="API Service URL"
            value={activeProfile.url}
            onChange={(event) =>
              updateProfile({ url: event.currentTarget.value })
            }
          />
          <PasswordInput
            label="API Key (optional for local APIs)"
            value={apiKey}
            onChange={(event) => updateApiKey(event.currentTarget.value)}
          />
          <Stack gap={4}>
            {availableModels.length > 0 ? (
              <MantineSelect
                label="AI Model"
                data={availableModels}
                value={activeProfile.model || null}
                searchable
                allowDeselect={false}
                onChange={(value) => value && updateProfile({ model: value })}
              />
            ) : (
              <TextInput
                label="AI Model"
                value={activeProfile.model}
                onChange={(event) =>
                  updateProfile({ model: event.currentTarget.value })
                }
              />
            )}
            <Button
              type="button"
              size="compact-xs"
              variant="subtle"
              loading={modelsMutation.isPending}
              disabled={!activeProfile.url}
              onClick={fetchModels}
              style={{ alignSelf: "flex-start" }}
            >
              Fetch Models
            </Button>
          </Stack>
          <NumberInput
            label="Request timeout (seconds)"
            min={10}
            max={3600}
            value={activeProfile.timeout}
            onChange={(value) =>
              updateProfile({
                timeout: typeof value === "number" ? value : 180,
              })
            }
          />
          <NumberInput
            label="Lines per batch"
            min={1}
            max={1000}
            value={activeProfile.batch_size}
            onChange={(value) =>
              updateProfile({
                batch_size: typeof value === "number" ? value : 100,
              })
            }
          />
          <NumberInput
            label="Concurrent API calls"
            min={1}
            max={10}
            value={activeProfile.max_concurrent}
            onChange={(value) =>
              updateProfile({
                max_concurrent: typeof value === "number" ? value : 1,
              })
            }
          />
          <NumberInput
            label="Temperature"
            min={0}
            max={2}
            step={0.1}
            value={activeProfile.temperature}
            onChange={(value) =>
              updateProfile({
                temperature: typeof value === "number" ? value : 0.2,
              })
            }
          />
          <MantineSelect
            label="Reasoning Mode"
            data={aiTranslatorReasoningOptions}
            value={activeProfile.reasoning}
            onChange={(value) => value && updateProfile({ reasoning: value })}
            allowDeselect={false}
          />
        </SimpleGrid>
        <Message>
          Each profile keeps its own endpoint, key, model, and tuning. The URL
          must expose an OpenAI-compatible /chat/completions endpoint.
        </Message>
        <Group justify="flex-end">
          <TestConnectionButton
            directConfig={{
              url: activeProfile.url,
              apiKey,
              model: activeProfile.model,
            }}
          />
        </Group>
      </Stack>
    </Paper>
  );
};

const SettingsTranslatorContent: FunctionComponent = () => {
  return (
    <>
      <Stack gap="md" mt="lg">
        <TranslatorEnginePicker />
      </Stack>
      <Stack gap="md" mt="md">
        <Paper withBorder p="md">
          <Group gap="lg" align="center">
            <Group gap="xs" align="center">
              <MantineText size="sm" c="var(--bz-text-tertiary)">
                Score
              </MantineText>
              <Number
                settingKey="settings-translator-default_score"
                min={0}
                max={100}
                step={1}
                w={70}
                size="xs"
              />
              <Tooltip
                label="Score assigned to translated subtitles (0-100). Higher scores are preferred over lower ones."
                multiline
                w={250}
                withArrow
              >
                <MantineText
                  size="xs"
                  c="var(--bz-text-tertiary)"
                  style={{ cursor: "help" }}
                  component="span"
                >
                  <FontAwesomeIcon icon={faCircleInfo} />
                </MantineText>
              </Tooltip>
            </Group>
            <Group gap="xs" align="center">
              <MantineText size="sm" c="var(--bz-text-tertiary)">
                Min Source Score
              </MantineText>
              <Number
                settingKey="settings-translator-min_source_score"
                min={0}
                max={100}
                step={1}
                w={70}
                size="xs"
              />
              <Tooltip
                label="Minimum quality score (0-100) a source subtitle must reach before auto-translation triggers via a language profile's 'Translate From' setting. Lower-scoring sources are likely badly synced or poorly matched."
                multiline
                w={280}
                withArrow
              >
                <MantineText
                  size="xs"
                  c="var(--bz-text-tertiary)"
                  style={{ cursor: "help" }}
                  component="span"
                >
                  <FontAwesomeIcon icon={faCircleInfo} />
                </MantineText>
              </Tooltip>
            </Group>
            <Group gap="xs" align="center">
              <Check
                label="Translation credit"
                settingKey="settings-translator-translator_info"
              />
              <Tooltip
                label="Appends a brief credit subtitle at the end of translated files (e.g. '# Subtitles translated with AI Subtitle Translator #')"
                multiline
                w={280}
                withArrow
              >
                <MantineText
                  size="xs"
                  c="var(--bz-text-tertiary)"
                  style={{ cursor: "help" }}
                  component="span"
                >
                  <FontAwesomeIcon icon={faCircleInfo} />
                </MantineText>
              </Tooltip>
            </Group>
          </Group>
        </Paper>
        <CollapseBox
          settingKey="settings-translator-translator_type"
          on={(val) => val === "openai_compatible"}
        >
          <AIProfilesEditor />
        </CollapseBox>

        <CollapseBox
          settingKey="settings-translator-translator_type"
          on={(val) => val === "google_translate"}
        >
          <Message>
            Google Translate does not require additional engine settings.
          </Message>
        </CollapseBox>

        {/* Gemini config — unchanged */}
        <CollapseBox
          settingKey="settings-translator-translator_type"
          on={(val) => val === "gemini"}
        >
          <Section header="Gemini Configuration">
            <Text
              label="Gemini model"
              settingKey="settings-translator-gemini_model"
            />
            <Number
              label="Gemini batch size"
              settingKey="settings-translator-gemini_batch_size"
              min={1}
            />
            <Message>
              Number of subtitle lines sent in each Gemini request. Higher
              values reduce the number of API calls and can speed up
              translation, but may increase timeout or response-size errors.
              Start with 300 (default), then lower it if requests fail or raise
              it gradually if your model handles larger batches reliably.
            </Message>
            <Chips
              label="Gemini API keys"
              settingKey="settings-translator-gemini_keys"
              sanitizeFn={(values) => {
                const uniqueKeys = new Set(
                  (values ?? []).map((value) => value.trim()).filter(Boolean),
                );
                return Array.from(uniqueKeys);
              }}
            />
            <Message>
              You can generate keys here: https://aistudio.google.com/apikey.
              Add as many keys as needed; Bazarr rotates across available keys.
            </Message>
          </Section>
        </CollapseBox>

        {/* Lingarr config — unchanged */}
        <CollapseBox
          settingKey="settings-translator-translator_type"
          on={(val) => val === "lingarr"}
        >
          <Section header="Lingarr Configuration">
            <Text
              label="Lingarr endpoint"
              settingKey="settings-translator-lingarr_url"
            />
            <Message>Base URL of Lingarr (e.g., http://localhost:9876)</Message>
            <Text
              label="Lingarr API Key (optional)"
              settingKey="settings-translator-lingarr_token"
            />
            <Message>
              Optional API key for authentication. Leave empty if your Lingarr
              instance doesn't require authentication.
            </Message>
          </Section>
        </CollapseBox>

        {/* AI Subtitle Translator — Zones 2-4 */}
        <CollapseBox
          settingKey="settings-translator-translator_type"
          on={(val) => val === "openrouter"}
        >
          <Stack gap="md" mt="md">
            {/* Zone 2: Connection Card */}
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <div>
                  <Text
                    label="Service URL"
                    settingKey="settings-translator-openrouter_url"
                  />
                  <MantineText size="xs" c="var(--bz-text-tertiary)" mt={4}>
                    <Anchor
                      href="https://github.com/LavX/ai-subtitle-translator/blob/main/docs/BAZARR-SETUP.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      size="xs"
                      c="yellow.6"
                    >
                      Setup guide
                    </Anchor>
                  </MantineText>
                </div>
                <div>
                  <Password
                    label="OpenRouter API Key"
                    settingKey="settings-translator-openrouter_api_key"
                  />
                  <MantineText size="xs" c="var(--bz-text-tertiary)" mt={4}>
                    <Anchor
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      size="xs"
                      c="yellow.6"
                    >
                      Get your API key
                    </Anchor>
                  </MantineText>
                </div>
                <div>
                  <Password
                    label="Encryption Key (optional)"
                    settingKey="settings-translator-openrouter_encryption_key"
                  />
                  <MantineText size="xs" c="var(--bz-text-tertiary)" mt={4}>
                    <Anchor
                      href="https://github.com/LavX/ai-subtitle-translator/blob/main/docs/BAZARR-SETUP.md#get-your-encryption-key"
                      target="_blank"
                      rel="noopener noreferrer"
                      size="xs"
                      c="yellow.6"
                    >
                      How to get your key
                    </Anchor>
                  </MantineText>
                </div>
              </SimpleGrid>
              <Group mt="xs" justify="flex-end">
                <TestConnectionButton />
              </Group>
            </Paper>

            {/* Zone 3: Model & Tuning Card */}
            <Paper withBorder p="md">
              <Stack gap="xs">
                <AIModelSelector />
                <FreeModelWarning />
                <MantineText size="xs" c="var(--bz-text-tertiary)">
                  Models are fetched from the service. You can also type any
                  model ID from{" "}
                  <Anchor
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    size="xs"
                  >
                    openrouter.ai/models
                  </Anchor>
                </MantineText>
                <ModelDetailsFromSetting />
                <SimpleGrid cols={{ base: 1, sm: 4 }} mt="xs">
                  <div>
                    <Slider
                      label="Temperature"
                      settingKey="settings-translator-openrouter_temperature"
                      min={0}
                      max={1}
                      step={0.1}
                    />
                    <MantineText
                      size="xs"
                      c="var(--bz-text-tertiary)"
                      mt={4}
                      ta="center"
                    >
                      deterministic ← → creative
                    </MantineText>
                  </div>
                  <ReasoningSelector />
                  <Tooltip
                    label="Hard limit on simultaneous translation jobs. Bazarr will queue excess jobs until a slot opens."
                    multiline
                    w={250}
                    withArrow
                  >
                    <Selector
                      label="Max Concurrent Jobs"
                      options={aiTranslatorConcurrentOptions}
                      settingKey="settings-translator-openrouter_max_concurrent"
                    />
                  </Tooltip>
                  <Tooltip
                    label="Batches sent in parallel per job. Higher = faster but more rate limits. Keep low (1-2) for free models."
                    multiline
                    w={250}
                    withArrow
                  >
                    <Selector
                      label="Parallel Batches"
                      options={aiTranslatorParallelBatchesOptions}
                      settingKey="settings-translator-openrouter_parallel_batches"
                    />
                  </Tooltip>
                </SimpleGrid>
              </Stack>
            </Paper>

            {/* Zone 4: Status & Jobs */}
            <TranslatorStatusPanelWithFormContext />
          </Stack>
        </CollapseBox>
      </Stack>
    </>
  );
};

const SettingsTranslatorView: FunctionComponent = () => {
  return (
    <Layout name="AI Translator">
      <SettingsTranslatorContent />
    </Layout>
  );
};

export default SettingsTranslatorView;
