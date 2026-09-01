import { FunctionComponent, useMemo } from "react";
import { Anchor, Breadcrumbs, Container, Divider, Stack, Table, Text, Title } from "@mantine/core";
import { Link, Navigate, useParams } from "react-router";
import { useDocumentTitle } from "@mantine/hooks";
import { QueryOverlay } from "@/components/async";
import { useEpisodesBySeriesId, useSeriesById } from "@/apis/hooks";
import { Subtitle } from "./components";

const EpisodeDetails: FunctionComponent = () => {
  const { id, episodeId } = useParams();
  const seriesId = Number.parseInt(id ?? "");
  const upstreamEpisodeId = Number.parseInt(episodeId ?? "");
  const seriesQuery = useSeriesById(seriesId);
  const episodesQuery = useEpisodesBySeriesId(seriesId);
  const episode = useMemo(
    () => episodesQuery.data?.find((item) => item.sonarrEpisodeId === upstreamEpisodeId),
    [episodesQuery.data, upstreamEpisodeId],
  );

  useDocumentTitle(`${episode?.title ?? "Episode"} - Bazarr`);

  if (Number.isNaN(seriesId) || Number.isNaN(upstreamEpisodeId)) {
    return <Navigate to="/series" />;
  }

  return (
    <Container px="xs" fluid>
      <Breadcrumbs mb="md">
        <Anchor component={Link} to="/series">Series</Anchor>
        <Anchor component={Link} to={`/series/${seriesId}`}>
          {seriesQuery.data?.title ?? "Series"}
        </Anchor>
        <Text>{episode?.title ?? "Episode"}</Text>
      </Breadcrumbs>
      <QueryOverlay result={episodesQuery}>
        {!episode ? (
          <Text c="dimmed">Episode not found.</Text>
        ) : (
          <Stack gap="md">
            <div>
              <Title order={3}>{episode.title}</Title>
              <Text c="dimmed">Season {episode.season}, Episode {episode.episode}</Text>
            </div>
            <Divider />
            <div>
              <Text fw={600}>Video file</Text>
              <Text size="sm" c="dimmed" style={{ wordBreak: "break-all" }}>
                {episode.path || "No video file found"}
              </Text>
            </div>
            <Divider />
            <Title order={4}>Subtitles</Title>
            <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead><Table.Tr><Table.Th>Subtitle Path</Table.Th><Table.Th>Language</Table.Th><Table.Th>Embedded</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {(episode.subtitles ?? []).map((subtitle, index) => (
                  <Table.Tr key={`${subtitle.code2}-${subtitle.path ?? "embedded"}-${index}`}>
                    <Table.Td>{subtitle.path || "Video File Subtitle Track"}</Table.Td>
                    <Table.Td><Subtitle seriesId={episode.sonarrSeriesId} episodeId={episode.sonarrEpisodeId} arrInstanceId={episode.arr_instance_id} subtitle={subtitle} availableSubtitles={episode.subtitles} /></Table.Td>
                    <Table.Td>{subtitle.path ? "No" : "Yes"}</Table.Td>
                  </Table.Tr>
                ))}
                {(episode.missing_subtitles ?? []).map((subtitle, index) => (
                  <Table.Tr key={`missing-${subtitle.code2}-${index}`}>
                    <Table.Td c="dimmed">Missing Subtitles</Table.Td>
                    <Table.Td><Subtitle seriesId={episode.sonarrSeriesId} episodeId={episode.sonarrEpisodeId} arrInstanceId={episode.arr_instance_id} missing subtitle={subtitle} availableSubtitles={episode.subtitles} /></Table.Td>
                    <Table.Td>No</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
          </Stack>
        )}
      </QueryOverlay>
    </Container>
  );
};

export default EpisodeDetails;
