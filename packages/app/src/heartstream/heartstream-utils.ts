// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type {
  Communication,
  Device,
  Location,
  Observation,
  Parameters,
  ParametersParameter,
  Resource,
  Task,
} from '@medplum/fhirtypes';

export const HEARTSTREAM_DEMO_TAG_SYSTEM = 'https://medplum.com/demo/heartstream';
export const HEARTSTREAM_DEMO_TAG_CODE = 'fleet-readiness';
export const HEARTSTREAM_EVENT_SYSTEM = 'https://medplum.com/demo/heartstream/readiness-event';
export const HEARTSTREAM_TAG_QUERY = `_tag=${encodeURIComponent(
  `${HEARTSTREAM_DEMO_TAG_SYSTEM}|${HEARTSTREAM_DEMO_TAG_CODE}`
)}&_count=100`;

export type HeartStreamAction = 'seed' | 'reset' | 'create-device' | 'simulate-event';
export type HeartStreamEventType = 'low-battery' | 'pads-expiring' | 'missed-check-in' | 'failed-self-test';

export interface HeartStreamFleetData {
  readonly locations: WithId<Location>[];
  readonly devices: WithId<Device>[];
  readonly observations: WithId<Observation>[];
  readonly tasks: WithId<Task>[];
  readonly communications: WithId<Communication>[];
}

export interface HeartStreamTimelineEntry {
  readonly id: string;
  readonly title: string;
  readonly timestamp: string | undefined;
  readonly detail: string;
}

export const HEARTSTREAM_EVENT_OPTIONS: { value: HeartStreamEventType; label: string }[] = [
  { value: 'low-battery', label: 'Low battery' },
  { value: 'pads-expiring', label: 'Pads expiring soon' },
  { value: 'missed-check-in', label: 'Missed check-in' },
  { value: 'failed-self-test', label: 'Failed self-test' },
];

export function buildHeartStreamParameters(
  action: HeartStreamAction,
  input: Record<string, string | undefined> = {}
): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'action', valueString: action },
      ...Object.entries(input).flatMap(([name, value]) => (value ? [{ name, valueString: value }] : [])),
    ],
  };
}

export function getParameterString(parameters: Parameters | undefined, name: string): string | undefined {
  return parameters?.parameter?.find((param) => param.name === name)?.valueString;
}

export function getDeviceDisplay(device: Device | undefined): string {
  return device?.deviceName?.[0]?.name || device?.serialNumber || device?.id || 'HeartStream AED';
}

export function getDeviceLocation(device: Device): string {
  return device.location?.display || device.location?.reference || 'Unassigned';
}

export function getReadinessStatus(device: WithId<Device>, observations: WithId<Observation>[]): string {
  const latest = observations
    .filter((observation) => observation.device?.reference === `Device/${device.id}`)
    .sort(compareByEventTimestamp)[0];
  return latest?.valueCodeableConcept?.text || latest?.valueCodeableConcept?.coding?.[0]?.display || 'Ready';
}

export function getActiveTasks(tasks: WithId<Task>[]): WithId<Task>[] {
  return tasks.filter((task) => !['completed', 'cancelled', 'rejected', 'entered-in-error'].includes(task.status));
}

export function getTimelineEntries(data: HeartStreamFleetData): HeartStreamTimelineEntry[] {
  const observations = data.observations.map((observation) => ({
    id: `Observation/${observation.id}`,
    title: observation.code.text || observation.code.coding?.[0]?.display || 'Readiness event',
    timestamp: observation.effectiveDateTime,
    detail: observation.valueCodeableConcept?.text || observation.valueCodeableConcept?.coding?.[0]?.display || '',
  }));
  const communications = data.communications.map((communication) => ({
    id: `Communication/${communication.id}`,
    title: communication.category?.[0]?.text || 'Operations communication',
    timestamp: communication.sent,
    detail: communication.payload?.[0]?.contentString || '',
  }));
  return [...observations, ...communications].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
}

export function getResourceReference(resource: Resource): string {
  return `${resource.resourceType}/${resource.id}`;
}

function compareByEventTimestamp(a: Observation, b: Observation): number {
  return (b.effectiveDateTime || '').localeCompare(a.effectiveDateTime || '');
}

export function getOutput(parameter: ParametersParameter[] | undefined, name: string): string | number | undefined {
  const match = parameter?.find((param) => param.name === name);
  return match?.valueString ?? match?.valueInteger;
}
