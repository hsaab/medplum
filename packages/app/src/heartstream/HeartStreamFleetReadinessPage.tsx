// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ContentType, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { Container, Loading, Panel, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildHeartStreamParameters,
  getActiveTasks,
  getDeviceDisplay,
  getDeviceLocation,
  getParameterString,
  getReadinessStatus,
  getTimelineEntries,
  HEARTSTREAM_EVENT_OPTIONS,
  HEARTSTREAM_TAG_QUERY,
  type HeartStreamAction,
  type HeartStreamEventType,
  type HeartStreamFleetData,
} from './heartstream-utils';

const initialFleetData: HeartStreamFleetData = {
  locations: [],
  devices: [],
  observations: [],
  tasks: [],
  communications: [],
};

export function HeartStreamFleetReadinessPage(): JSX.Element {
  const medplum = useMedplum();
  const [fleetData, setFleetData] = useState<HeartStreamFleetData>(initialFleetData);
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState<HeartStreamAction>();
  const [siteName, setSiteName] = useState('Demo Atrium');
  const [deviceName, setDeviceName] = useState('Atrium HeartStream AED');
  const [serialNumber, setSerialNumber] = useState('HS-ATRIUM-1');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>();
  const [eventType, setEventType] = useState<HeartStreamEventType>('low-battery');
  const [fhirTrace, setFhirTrace] = useState('[]');

  const refreshFleet = useCallback(async () => {
    const [locations, devices, observations, tasks, communications] = await Promise.all([
      medplum.searchResources('Location', HEARTSTREAM_TAG_QUERY),
      medplum.searchResources('Device', HEARTSTREAM_TAG_QUERY),
      medplum.searchResources('Observation', HEARTSTREAM_TAG_QUERY),
      medplum.searchResources('Task', HEARTSTREAM_TAG_QUERY),
      medplum.searchResources('Communication', HEARTSTREAM_TAG_QUERY),
    ]);
    setFleetData({ locations, devices, observations, tasks, communications });
    setSelectedDeviceId((current) => current || devices[0]?.id);
  }, [medplum]);

  useEffect(() => {
    refreshFleet()
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setLoading(false));
  }, [refreshFleet]);

  const activeTasks = useMemo(() => getActiveTasks(fleetData.tasks), [fleetData.tasks]);
  const timelineEntries = useMemo(() => getTimelineEntries(fleetData), [fleetData]);
  const readyCount = useMemo(
    () => fleetData.devices.filter((device) => getReadinessStatus(device, fleetData.observations) === 'Ready').length,
    [fleetData.devices, fleetData.observations]
  );
  const deviceOptions = useMemo(
    () => fleetData.devices.map((device) => ({ value: device.id, label: getDeviceDisplay(device) })),
    [fleetData.devices]
  );

  const runOperation = useCallback(
    async (action: HeartStreamAction, input: Record<string, string | undefined> = {}) => {
      setWorkingAction(action);
      try {
        const result = await medplum.post<Parameters>(
          medplum.fhirUrl('$heartstream-demo'),
          buildHeartStreamParameters(action, input),
          ContentType.FHIR_JSON
        );
        setFhirTrace(getParameterString(result, 'fhirTrace') || '[]');
        showNotification({ color: 'green', message: getParameterString(result, 'message') || 'Done' });
        await refreshFleet();
      } catch (err) {
        showError(normalizeErrorString(err));
      } finally {
        setWorkingAction(undefined);
      }
    },
    [medplum, refreshFleet]
  );

  if (loading) {
    return <Loading />;
  }

  return (
    <Container maw="100%">
      <Panel>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={1}>HeartStream Fleet Readiness</Title>
              <Text c="dimmed">Operational AED readiness, maintenance follow-up, and compliance traceability.</Text>
            </div>
            <Group>
              <Button loading={workingAction === 'seed'} onClick={() => runOperation('seed')}>
                Seed demo fleet
              </Button>
              <Button variant="outline" color="red" loading={workingAction === 'reset'} onClick={() => runOperation('reset')}>
                Reset demo data
              </Button>
            </Group>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <SummaryCard label="AED devices" value={fleetData.devices.length} />
            <SummaryCard label="Sites" value={fleetData.locations.length} />
            <SummaryCard label="Ready" value={readyCount} tone="green" />
            <SummaryCard label="Active tasks" value={activeTasks.length} tone={activeTasks.length ? 'orange' : 'green'} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Card withBorder>
              <Stack>
                <Title order={2}>Add AED/site</Title>
                <TextInput label="Site name" value={siteName} onChange={(e) => setSiteName(e.currentTarget.value)} />
                <TextInput label="Device name" value={deviceName} onChange={(e) => setDeviceName(e.currentTarget.value)} />
                <TextInput
                  label="Serial number"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.currentTarget.value)}
                />
                <Button
                  loading={workingAction === 'create-device'}
                  onClick={() => runOperation('create-device', { siteName, deviceName, serialNumber })}
                >
                  Create AED
                </Button>
              </Stack>
            </Card>

            <Card withBorder>
              <Stack>
                <Title order={2}>Simulate readiness event</Title>
                <Select
                  label="Device"
                  data={deviceOptions}
                  value={selectedDeviceId}
                  onChange={(value) => setSelectedDeviceId(value || undefined)}
                />
                <Select
                  label="Event"
                  data={HEARTSTREAM_EVENT_OPTIONS}
                  value={eventType}
                  onChange={(value) => setEventType((value as HeartStreamEventType | null) || 'low-battery')}
                />
                <Button
                  loading={workingAction === 'simulate-event'}
                  disabled={!selectedDeviceId}
                  onClick={() => runOperation('simulate-event', { deviceId: selectedDeviceId, eventType })}
                >
                  Simulate event
                </Button>
              </Stack>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }}>
            <DeviceTable devices={fleetData.devices} observations={fleetData.observations} />
            <ActiveTaskPanel tasks={activeTasks} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }}>
            <EventTimeline entries={timelineEntries} />
            <Card withBorder>
              <Title order={2}>FHIR trace</Title>
              <Textarea value={fhirTrace} readOnly autosize minRows={10} mt="md" />
            </Card>
          </SimpleGrid>
        </Stack>
      </Panel>
    </Container>
  );
}

function SummaryCard(props: { label: string; value: number; tone?: string }): JSX.Element {
  return (
    <Card withBorder>
      <Text size="sm" c="dimmed">
        {props.label}
      </Text>
      <Text size="xl" fw={700} c={props.tone}>
        {props.value}
      </Text>
    </Card>
  );
}

function DeviceTable(props: { devices: HeartStreamFleetData['devices']; observations: HeartStreamFleetData['observations'] }): JSX.Element {
  return (
    <Card withBorder>
      <Title order={2}>Device fleet</Title>
      <Table withTableBorder withRowBorders mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Device</Table.Th>
            <Table.Th>Site</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Serial</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {props.devices.map((device) => {
            const readinessStatus = getReadinessStatus(device, props.observations);
            return (
              <Table.Tr key={device.id}>
                <Table.Td>{getDeviceDisplay(device)}</Table.Td>
                <Table.Td>{getDeviceLocation(device)}</Table.Td>
                <Table.Td>
                  <Badge color={readinessStatus === 'Ready' ? 'green' : 'orange'}>{readinessStatus}</Badge>
                </Table.Td>
                <Table.Td>{device.serialNumber}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function ActiveTaskPanel(props: { tasks: HeartStreamFleetData['tasks'] }): JSX.Element {
  const task = props.tasks[0];
  return (
    <Card withBorder>
      <Title order={2}>Active maintenance task</Title>
      {task ? (
        <Stack mt="md">
          <Badge color="orange">{task.status}</Badge>
          <Title order={3}>{task.code?.text || task.code?.coding?.[0]?.display}</Title>
          <Text>{task.description}</Text>
          <Text c="dimmed">Device: {task.focus?.display || task.focus?.reference}</Text>
          <Text c="dimmed">Opened: {formatDateTime(task.authoredOn)}</Text>
        </Stack>
      ) : (
        <Text mt="md" c="dimmed">
          No active maintenance tasks.
        </Text>
      )}
    </Card>
  );
}

function EventTimeline(props: { entries: ReturnType<typeof getTimelineEntries> }): JSX.Element {
  return (
    <Card withBorder>
      <Title order={2}>Recent event timeline</Title>
      <Timeline mt="md" active={props.entries.length}>
        {props.entries.map((entry) => (
          <Timeline.Item key={entry.id} title={entry.title}>
            <Text size="sm">{entry.detail}</Text>
            <Text size="xs" c="dimmed">
              {formatDateTime(entry.timestamp)}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Card>
  );
}

function showError(message: string): void {
  showNotification({ color: 'red', message, autoClose: false });
}
