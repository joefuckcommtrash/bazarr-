import { FunctionComponent, useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ActionIcon,
  Anchor,
  Badge,
  Checkbox,
  Group,
  Menu,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  faEllipsisVertical,
  faEraser,
  faLanguage,
  faMicrophone,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ColumnDef } from "@tanstack/react-table";
import {
  useAudioLanguages,
  useBatchAction,
  useEpisodeSubtitleModification,
  useEpisodeWantedPagination,
  useLanguageProfiles,
  useSeriesAction,
  useSeriesModification,
} from "@/apis/hooks";
import { useArrInstanceLabels } from "@/apis/hooks/arrInstances";
import { AudioList, InstanceBadge } from "@/components/bazarr";
import Language from "@/components/bazarr/Language";
import {
  MassTranslateModal,
  WantedItem,
} from "@/components/forms/MassTranslateForm";
import { useModals } from "@/modules/modals";
import WantedView from "@/pages/views/WantedView";
import { BuildKey } from "@/utilities";
import tableStyles from "@/components/tables/BaseTable.module.scss";

const WantedSeriesView: FunctionComponent = () => {
  const { download } = useEpisodeSubtitleModification();
  const modifySeries = useSeriesModification();
  const whisper = useBatchAction();
  const modals = useModals();

  const [search, setSearch] = useState("");
  const [audioLanguages, setAudioLanguages] = useState<string[]>([]);
  const [excludeLanguages, setExcludeLanguages] = useState<string[]>([]);
  const [missingLanguage, setMissingLanguage] = useState<string | null>(null);
  const [existingLanguage, setExistingLanguage] = useState<string | null>(null);
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const hasActiveFilter =
    debouncedSearch.length > 0 ||
    audioLanguages.length > 0 ||
    excludeLanguages.length > 0 ||
    missingLanguage !== null ||
    existingLanguage !== null;

  const { data: audioLangs = [] } = useAudioLanguages();
  const { data: languageProfiles = [] } = useLanguageProfiles();
  const profileNameById = useMemo(
    () =>
      new Map(
        languageProfiles.map((profile) => [profile.profileId, profile.name]),
      ),
    [languageProfiles],
  );
  const {
    multiInstance,
    nameById: instanceNameById,
    defaultId: instanceDefaultId,
  } = useArrInstanceLabels("sonarr");
  const query = useEpisodeWantedPagination(hasActiveFilter);

  const langOptions = useMemo(
    () => audioLangs.map((l) => ({ value: l.code2, label: l.name })),
    [audioLangs],
  );

  // Build client-side filter function
  const dataFilter = useCallback(
    (item: Wanted.Episode) => {
      if (debouncedSearch) {
        const lowerSearch = debouncedSearch.toLowerCase();
        if (!item.seriesTitle.toLowerCase().includes(lowerSearch)) {
          return false;
        }
      }
      if (audioLanguages.length > 0) {
        const itemLangs = item.audio_language ?? [];
        const hasMatchingLang = itemLangs.some((lang) =>
          audioLanguages.includes(lang.code2),
        );
        if (!hasMatchingLang) {
          return false;
        }
      }
      if (excludeLanguages.length > 0) {
        const itemLangs = item.audio_language ?? [];
        const hasExcludedLang = itemLangs.some((lang) =>
          excludeLanguages.includes(lang.code2),
        );
        if (hasExcludedLang) {
          return false;
        }
      }
      if (missingLanguage) {
        const hasMissing = item.missing_subtitles.some(
          (sub) => sub.code2 === missingLanguage,
        );
        if (!hasMissing) {
          return false;
        }
      }
      if (existingLanguage) {
        const hasExisting = (item.subtitles ?? []).some(
          (sub) => sub.code2 === existingLanguage,
        );
        if (!hasExisting) {
          return false;
        }
      }
      return true;
    },
    [
      debouncedSearch,
      audioLanguages,
      excludeLanguages,
      missingLanguage,
      existingLanguage,
    ],
  );

  const generateWithWhisper = useCallback(
    async (item: Wanted.Episode) => {
      const language =
        missingLanguage &&
        item.missing_subtitles.some((sub) => sub.code2 === missingLanguage)
          ? missingLanguage
          : undefined;
      try {
        await whisper.mutateAsync({
          items: [
            {
              type: "episode",
              sonarrSeriesId: item.sonarrSeriesId,
              sonarrEpisodeId: item.sonarrEpisodeId,
              arr_instance_id: item.arr_instance_id,
            },
          ],
          action: "whisper",
          options: language ? { toLang: language } : undefined,
        });
        notifications.show({
          title: "Whisper Queued",
          message: `${item.seriesTitle} - ${item.episodeTitle} was queued for ${language ?? "all missing languages"}.`,
          color: "green",
        });
      } catch (error) {
        notifications.show({
          title: "Whisper Failed",
          message: String(error),
          color: "red",
        });
      }
    },
    [missingLanguage, whisper],
  );

  const columns = useMemo<ColumnDef<Wanted.Episode>[]>(
    () => [
      {
        id: "selection",
        header: ({ table }) => {
          return (
            <Checkbox
              id="table-header-selection"
              indeterminate={table.getIsSomeRowsSelected()}
              checked={table.getIsAllRowsSelected()}
              onChange={table.getToggleAllRowsSelectedHandler()}
            />
          );
        },
        cell: ({ row: { index, getIsSelected, getToggleSelectedHandler } }) => {
          return (
            <Checkbox
              id={`table-cell-${index}`}
              checked={getIsSelected()}
              onChange={getToggleSelectedHandler()}
              onClick={getToggleSelectedHandler()}
            />
          );
        },
      },
      {
        header: "Name",
        accessorKey: "seriesTitle",
        cell: ({
          row: {
            original: { series_id: seriesId, seriesTitle, sonarrEpisodeId },
          },
        }) => {
          const target = `/series/${seriesId}/episode/${sonarrEpisodeId}`;
          return (
            <Anchor
              className={`table-primary ${tableStyles.episodeTitle}`}
              component={Link}
              to={target}
            >
              {seriesTitle}
            </Anchor>
          );
        },
      },
      // Owning Sonarr instance (#156), shown only with more than one Sonarr.
      // Default instance gets a muted grey badge, others an accent badge.
      ...(multiInstance
        ? [
            {
              id: "instance",
              header: "Instance",
              cell: ({ row: { original } }) => (
                <InstanceBadge
                  instanceId={original.arr_instance_id}
                  defaultId={instanceDefaultId}
                  nameById={instanceNameById}
                />
              ),
            } as ColumnDef<Wanted.Episode>,
          ]
        : []),
      {
        header: "Audio",
        accessorKey: "audio_language",
        cell: ({
          row: {
            original: { audio_language: audioLanguage },
          },
        }) => {
          return <AudioList audios={audioLanguage}></AudioList>;
        },
      },
      {
        header: "Episode",
        accessorKey: "episode_number",
        cell: ({
          row: {
            original: { episode_number: episodeNumber, series_id: seriesId, sonarrEpisodeId },
          },
        }) => {
          return (
            <Anchor
              component={Link}
              to={`/series/${seriesId}/episode/${sonarrEpisodeId}`}
              className={tableStyles.episodeNumber}
              underline="always"
            >
              {episodeNumber}
            </Anchor>
          );
        },
      },
      {
        header: "Profile",
        accessorKey: "profileId",
        cell: ({ row: { original } }) => (
          <Badge
            variant="light"
            color={original.profileId == null ? "gray" : undefined}
          >
            {original.profileId == null
              ? "None"
              : (profileNameById.get(original.profileId) ??
                `Profile ${original.profileId}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "episodeTitle",
        cell: ({
          row: {
            original: { episodeTitle, series_id: seriesId, sonarrEpisodeId },
          },
        }) => {
          return (
            <Anchor
              component={Link}
              to={`/series/${seriesId}/episode/${sonarrEpisodeId}`}
              className={tableStyles.episodeTitle}
              underline="always"
            >
              {episodeTitle}
            </Anchor>
          );
        },
      },
      {
        header: "Missing",
        accessorKey: "missing_subtitles",
        cell: ({
          row: {
            original: {
              sonarrSeriesId,
              sonarrEpisodeId,
              arr_instance_id: arrInstanceId,
              missing_subtitles: missingSubtitles,
            },
          },
        }) => {
          const seriesId = sonarrSeriesId;
          const episodeId = sonarrEpisodeId;
          return (
            <Group gap="sm">
              {missingSubtitles.map((item, idx) => (
                <Badge
                  color={download.isPending ? "gray" : undefined}
                  leftSection={<FontAwesomeIcon icon={faSearch} />}
                  key={BuildKey(idx, item.code2)}
                  style={{ cursor: "pointer" }}
                  onClick={async () => {
                    await download.mutateAsync({
                      seriesId,
                      episodeId,
                      arrInstanceId,
                      form: { language: item.code2, hi: item.hi, forced: item.forced },
                    });
                  }}
                >
                  <Language.Text value={item} />
                </Badge>
              ))}
            </Group>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row: { original } }) => (
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="Episode actions">
                <FontAwesomeIcon icon={faEllipsisVertical} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<FontAwesomeIcon icon={faLanguage} />}
                onClick={() =>
                  modals.openContextModal(MassTranslateModal, {
                    items: [
                      {
                        type: "episode",
                        sonarrSeriesId: original.sonarrSeriesId,
                        sonarrEpisodeId: original.sonarrEpisodeId,
                        arrInstanceId: original.arr_instance_id,
                        seriesTitle: original.seriesTitle,
                        episodeTitle: original.episodeTitle,
                      },
                    ],
                  })
                }
              >
                Translate...
              </Menu.Item>
              <Menu.Item
                disabled={whisper.isPending}
                leftSection={<FontAwesomeIcon icon={faMicrophone} />}
                onClick={() => void generateWithWhisper(original)}
              >
                Generate with Whisper
              </Menu.Item>
              <Menu.Item
                color="red"
                disabled={original.profileId == null || modifySeries.isPending}
                leftSection={<FontAwesomeIcon icon={faEraser} />}
                onClick={() =>
                  modals.openConfirmModal({
                    title: "Clear Series Language Profile",
                    children: `Clear the language profile from ${original.seriesTitle}? This affects every episode in the series.`,
                    labels: { confirm: "Clear Profile", cancel: "Cancel" },
                    confirmProps: { color: "red" },
                    onConfirm: () =>
                      modifySeries.mutate({
                        id: [original.series_id],
                        profileid: [null],
                      }),
                  })
                }
              >
                Clear Language Profile
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ),
      },
    ],
    [
      download,
      modals,
      modifySeries,
      whisper.isPending,
      generateWithWhisper,
      profileNameById,
      multiInstance,
      instanceNameById,
      instanceDefaultId,
    ],
  );

  const getWantedItem = useCallback((row: Wanted.Episode): WantedItem => {
    return {
      type: "episode",
      sonarrSeriesId: row.sonarrSeriesId,
      sonarrEpisodeId: row.sonarrEpisodeId,
      arrInstanceId: row.arr_instance_id,
      seriesTitle: row.seriesTitle,
      episodeTitle: row.episodeTitle,
    };
  }, []);

  const { mutateAsync } = useSeriesAction();

  return (
    <WantedView
      name="Series"
      columns={columns}
      query={query}
      searchValue={search}
      onSearchChange={setSearch}
      audioLanguages={audioLanguages}
      onAudioLanguagesChange={setAudioLanguages}
      excludeLanguages={excludeLanguages}
      onExcludeLanguagesChange={setExcludeLanguages}
      missingLanguage={missingLanguage ?? undefined}
      onMissingLanguageChange={setMissingLanguage}
      existingLanguage={existingLanguage ?? undefined}
      onExistingLanguageChange={setExistingLanguage}
      langOptions={langOptions}
      missingLangOptions={langOptions}
      existingLangOptions={langOptions}
      dataFilter={hasActiveFilter ? dataFilter : undefined}
      searchAll={() => mutateAsync({ action: "search-wanted" })}
      scanAll={() => mutateAsync({ action: "scan-wanted" })}
      getWantedItem={getWantedItem}
    />
  );
};

export default WantedSeriesView;
