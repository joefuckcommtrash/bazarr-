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
  faMicrophone,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ColumnDef } from "@tanstack/react-table";
import {
  useAudioLanguages,
  useBatchAction,
  useLanguageProfiles,
  useMovieAction,
  useMovieModification,
  useMovieSubtitleModification,
  useMovieWantedPagination,
} from "@/apis/hooks";
import { useArrInstanceLabels } from "@/apis/hooks/arrInstances";
import { AudioList, InstanceBadge } from "@/components/bazarr";
import Language from "@/components/bazarr/Language";
import { WantedItem } from "@/components/forms/MassTranslateForm";
import { useModals } from "@/modules/modals";
import WantedView from "@/pages/views/WantedView";
import { BuildKey } from "@/utilities";
import tableStyles from "@/components/tables/BaseTable.module.scss";

const WantedMoviesView: FunctionComponent = () => {
  const { download } = useMovieSubtitleModification();
  const modifyMovie = useMovieModification();
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
  } = useArrInstanceLabels("radarr");
  const query = useMovieWantedPagination(hasActiveFilter);

  const langOptions = useMemo(
    () => audioLangs.map((l) => ({ value: l.code2, label: l.name })),
    [audioLangs],
  );

  // Build client-side filter function
  const dataFilter = useCallback(
    (item: Wanted.Movie) => {
      if (debouncedSearch) {
        const lowerSearch = debouncedSearch.toLowerCase();
        if (!item.title.toLowerCase().includes(lowerSearch)) {
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
    async (item: Wanted.Movie) => {
      const language =
        missingLanguage &&
        item.missing_subtitles.some((sub) => sub.code2 === missingLanguage)
          ? missingLanguage
          : undefined;
      try {
        await whisper.mutateAsync({
          items: [
            {
              type: "movie",
              radarrId: item.radarrId,
              arr_instance_id: item.arr_instance_id,
            },
          ],
          action: "whisper",
          options: language ? { toLang: language } : undefined,
        });
        notifications.show({
          title: "Whisper Queued",
          message: `${item.title} was queued for ${language ?? "all missing languages"}.`,
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

  const columns = useMemo<ColumnDef<Wanted.Movie>[]>(
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
        accessorKey: "title",
        cell: ({
          row: {
            original: { id, title },
          },
        }) => {
          const target = `/movies/${id}`;
          return (
            <Anchor
              className={`table-primary ${tableStyles.episodeTitle}`}
              component={Link}
              to={target}
            >
              {title}
            </Anchor>
          );
        },
      },
      // Owning Radarr instance (#156), shown only with more than one Radarr.
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
            } as ColumnDef<Wanted.Movie>,
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
        header: "Missing",
        accessorKey: "missing_subtitles",
        cell: ({
          row: {
            original: {
              radarrId,
              arr_instance_id: arrInstanceId,
              missing_subtitles: missingSubtitles,
            },
          },
        }) => {
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
                      radarrId,
                      arrInstanceId,
                      form: {
                        language: item.code2,
                        hi: item.hi,
                        forced: item.forced,
                      },
                    });
                  }}
                >
                  <Language.Text value={item}></Language.Text>
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
              <ActionIcon variant="subtle" aria-label="Movie actions">
                <FontAwesomeIcon icon={faEllipsisVertical} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                disabled={whisper.isPending}
                leftSection={<FontAwesomeIcon icon={faMicrophone} />}
                onClick={() => void generateWithWhisper(original)}
              >
                Generate with Whisper
              </Menu.Item>
              <Menu.Item
                color="red"
                disabled={original.profileId == null || modifyMovie.isPending}
                leftSection={<FontAwesomeIcon icon={faEraser} />}
                onClick={() =>
                  modals.openConfirmModal({
                    title: "Clear Language Profile",
                    children: `Clear the language profile from ${original.title}?`,
                    labels: { confirm: "Clear Profile", cancel: "Cancel" },
                    confirmProps: { color: "red" },
                    onConfirm: () =>
                      modifyMovie.mutate({
                        id: [original.id],
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
      modifyMovie,
      whisper.isPending,
      generateWithWhisper,
      profileNameById,
      multiInstance,
      instanceNameById,
      instanceDefaultId,
    ],
  );

  const getWantedItem = useCallback((row: Wanted.Movie): WantedItem => {
    return {
      type: "movie",
      radarrId: row.radarrId,
      arrInstanceId: row.arr_instance_id,
      title: row.title,
    };
  }, []);

  const { mutateAsync } = useMovieAction();

  return (
    <WantedView
      name="Movies"
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

export default WantedMoviesView;
