import { FunctionComponent } from "react";
import { Divider, Stack, Table, Text, Title } from "@mantine/core";
import { useModals, withModal } from "@/modules/modals";
import { Subtitle } from "./components";

interface Props {
  episode: Item.Episode;
}

const EpisodeDetailsModal: FunctionComponent<Props> = ({ episode }) => {
  const { closeSelf } = useModals();
  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" fw={600}>Video file</Text>
        <Text size="sm" c="dimmed" style={{ wordBreak: "break-all" }}>
          {episode.path || "No video file found"}
        </Text>
      </div>
      <Divider />
      <Title order={5}>Subtitle tracks</Title>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Subtitle Path</Table.Th>
            <Table.Th>Language</Table.Th>
            <Table.Th>Embedded</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(episode.subtitles ?? []).map((subtitle, index) => (
            <Table.Tr key={`${subtitle.code2}-${subtitle.path ?? "embedded"}-${index}`}>
              <Table.Td>
                {subtitle.path || "Video File Subtitle Track"}
              </Table.Td>
              <Table.Td>
                <Subtitle
                  seriesId={episode.sonarrSeriesId}
                  episodeId={episode.sonarrEpisodeId}
                  arrInstanceId={episode.arr_instance_id}
                  subtitle={subtitle}
                  availableSubtitles={episode.subtitles}
                />
              </Table.Td>
              <Table.Td>{subtitle.path ? "No" : "Yes"}</Table.Td>
            </Table.Tr>
          ))}
          {(episode.missing_subtitles ?? []).map((subtitle, index) => (
            <Table.Tr key={`missing-${subtitle.code2}-${index}`}>
              <Table.Td c="dimmed">Missing Subtitles</Table.Td>
              <Table.Td>
                <Subtitle
                  seriesId={episode.sonarrSeriesId}
                  episodeId={episode.sonarrEpisodeId}
                  arrInstanceId={episode.arr_instance_id}
                  missing
                  subtitle={subtitle}
                  availableSubtitles={episode.subtitles}
                />
              </Table.Td>
              <Table.Td>No</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {(episode.subtitles ?? []).length === 0 &&
        (episode.missing_subtitles ?? []).length === 0 && (
          <Text c="dimmed">No subtitle tracks found.</Text>
        )}
      <Text size="xs" c="dimmed" onClick={closeSelf} style={{ cursor: "pointer" }}>
        Close
      </Text>
    </Stack>
  );
};

export const EpisodeDetailsModalView = withModal(
  EpisodeDetailsModal,
  "episode-details",
  { title: "Episode Details", size: "lg" },
);

export default EpisodeDetailsModal;
