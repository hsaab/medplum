// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getReferenceString, Operator, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Device, Location, OperationDefinition, Resource } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import {
  createHeartStreamDevice,
  createHeartStreamLocation,
  createReadinessCommunication,
  createReadinessObservation,
  createReadinessTask,
  HEARTSTREAM_BASELINE_FLEET,
  HEARTSTREAM_DEMO_TAG_CODE,
  HEARTSTREAM_DEMO_TAG_SYSTEM,
  HEARTSTREAM_EVENT_DEFINITIONS,
  type HeartStreamDeviceInput,
  type HeartStreamEventType,
} from './heartstreamdemo-data';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

type HeartStreamAction = 'seed' | 'reset' | 'create-device' | 'simulate-event';

interface HeartStreamDemoInput extends HeartStreamDeviceInput {
  readonly action: HeartStreamAction;
  readonly deviceId?: string;
  readonly eventType?: HeartStreamEventType;
}

interface HeartStreamOperationResult {
  readonly action: HeartStreamAction;
  readonly created?: number;
  readonly deleted?: number;
  readonly message: string;
  readonly fhirTrace: string;
}

const HEARTSTREAM_DELETE_ORDER = ['Communication', 'Task', 'Observation', 'Device', 'Location'] as const;
const HEARTSTREAM_TAG_TOKEN = `${HEARTSTREAM_DEMO_TAG_SYSTEM}|${HEARTSTREAM_DEMO_TAG_CODE}`;

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'heartstream-demo',
  status: 'active',
  kind: 'operation',
  code: 'heartstream-demo',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    { use: 'in', name: 'action', type: 'string', min: 1, max: '1' },
    { use: 'in', name: 'siteName', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'deviceName', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'serialNumber', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'deviceId', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'eventType', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'action', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'created', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'deleted', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'fhirTrace', type: 'string', min: 1, max: '1' },
  ],
};

export async function heartStreamDemoHandler(req: FhirRequest): Promise<FhirResponse> {
  const input = parseInputParameters<HeartStreamDemoInput>(operation, req);

  switch (input.action) {
    case 'seed':
      return [allOk, buildOutputParameters(operation, await seedHeartStreamFleet())];
    case 'reset':
      return [allOk, buildOutputParameters(operation, await resetHeartStreamDemo())];
    case 'create-device':
      return [allOk, buildOutputParameters(operation, await createHeartStreamDemoDevice(input))];
    case 'simulate-event':
      return [allOk, buildOutputParameters(operation, await simulateHeartStreamEvent(input))];
    default:
      return [badRequest(`Unsupported HeartStream demo action: ${input.action}`)];
  }
}

async function seedHeartStreamFleet(): Promise<HeartStreamOperationResult> {
  await resetTaggedResources();
  const createdRefs: string[] = [];

  for (const [index, input] of HEARTSTREAM_BASELINE_FLEET.entries()) {
    const { device, location } = await createLocationAndDevice(input, index);
    createdRefs.push(getReferenceString(location), getReferenceString(device));
  }

  const event = HEARTSTREAM_EVENT_DEFINITIONS['pads-expiring'];
  const devices = await searchTaggedResources<Device>('Device');
  if (devices[1]) {
    const eventRefs = await createReadinessEventResources(devices[1], event);
    createdRefs.push(...eventRefs);
  }

  return makeResult('seed', {
    created: createdRefs.length,
    message: 'Seeded HeartStream demo fleet.',
    fhirTrace: createdRefs,
  });
}

async function resetHeartStreamDemo(): Promise<HeartStreamOperationResult> {
  const deletedRefs = await resetTaggedResources();
  return makeResult('reset', {
    deleted: deletedRefs.length,
    message: 'Reset HeartStream demo resources.',
    fhirTrace: deletedRefs,
  });
}

async function createHeartStreamDemoDevice(input: HeartStreamDeviceInput): Promise<HeartStreamOperationResult> {
  const { device, location } = await createLocationAndDevice(input, 0);
  const event = HEARTSTREAM_EVENT_DEFINITIONS['missed-check-in'];
  const observation = await getAuthenticatedContext().repo.createResource(createReadinessObservation(device, event, now()));

  return makeResult('create-device', {
    created: 3,
    message: 'Created HeartStream AED site and initial readiness state.',
    fhirTrace: [getReferenceString(location), getReferenceString(device), getReferenceString(observation)],
  });
}

async function simulateHeartStreamEvent(input: HeartStreamDemoInput): Promise<HeartStreamOperationResult> {
  const event = HEARTSTREAM_EVENT_DEFINITIONS[input.eventType || 'low-battery'];
  if (!event) {
    throw new OperationOutcomeError(badRequest(`Unsupported HeartStream readiness event: ${input.eventType}`));
  }

  const device = await selectEventDevice(input.deviceId);
  const createdRefs = await createReadinessEventResources(device, event);

  return makeResult('simulate-event', {
    created: createdRefs.length,
    message: `Simulated ${event.display.toLowerCase()} readiness event.`,
    fhirTrace: createdRefs,
  });
}

async function createLocationAndDevice(
  input: HeartStreamDeviceInput,
  index: number
): Promise<{ location: Location & { id: string }; device: Device & { id: string } }> {
  const ctx = getAuthenticatedContext();
  const location = await ctx.repo.createResource(createHeartStreamLocation(input, index));
  const device = await ctx.repo.createResource(createHeartStreamDevice(input, location, index));
  return { location, device };
}

async function createReadinessEventResources(
  device: Device & { id: string },
  event: (typeof HEARTSTREAM_EVENT_DEFINITIONS)[HeartStreamEventType]
): Promise<string[]> {
  const ctx = getAuthenticatedContext();
  const timestamp = now();
  const observation = await ctx.repo.createResource(createReadinessObservation(device, event, timestamp));
  const task = await ctx.repo.createResource(createReadinessTask(device, event, timestamp));
  const communication = await ctx.repo.createResource(createReadinessCommunication(device, event, timestamp));
  return [getReferenceString(observation), getReferenceString(task), getReferenceString(communication)];
}

async function selectEventDevice(deviceId: string | undefined): Promise<Device & { id: string }> {
  const ctx = getAuthenticatedContext();
  if (deviceId) {
    const device = await ctx.repo.readResource<Device>('Device', deviceId);
    if (!hasHeartStreamDemoTag(device)) {
      throw new OperationOutcomeError(badRequest('Device is not part of the HeartStream demo fleet.'));
    }
    return device;
  }

  const devices = await searchTaggedResources<Device>('Device');
  if (devices.length === 0) {
    throw new OperationOutcomeError(badRequest('Seed or create a HeartStream AED before simulating an event.'));
  }
  return devices[0];
}

async function resetTaggedResources(): Promise<string[]> {
  const ctx = getAuthenticatedContext();
  const deletedRefs: string[] = [];

  for (const resourceType of HEARTSTREAM_DELETE_ORDER) {
    const resources = await searchTaggedResources(resourceType);
    for (const resource of resources) {
      if (resource.id) {
        await ctx.repo.deleteResource(resource.resourceType, resource.id);
        deletedRefs.push(`${resource.resourceType}/${resource.id}`);
      }
    }
  }

  return deletedRefs;
}

async function searchTaggedResources<T extends Resource>(resourceType: T['resourceType']): Promise<(T & { id: string })[]> {
  const ctx = getAuthenticatedContext();
  return ctx.repo.searchResources<T>({
    resourceType,
    count: 1000,
    filters: [{ code: '_tag', operator: Operator.EQUALS, value: HEARTSTREAM_TAG_TOKEN }],
  }) as Promise<(T & { id: string })[]>;
}

function hasHeartStreamDemoTag(resource: Resource): boolean {
  return !!resource.meta?.tag?.some(
    (tag) => tag.system === HEARTSTREAM_DEMO_TAG_SYSTEM && tag.code === HEARTSTREAM_DEMO_TAG_CODE
  );
}

function makeResult(
  action: HeartStreamAction,
  input: Omit<HeartStreamOperationResult, 'action' | 'fhirTrace'> & { fhirTrace: string[] }
): HeartStreamOperationResult {
  return {
    action,
    created: input.created,
    deleted: input.deleted,
    message: input.message,
    fhirTrace: JSON.stringify(input.fhirTrace, undefined, 2),
  };
}

function now(): string {
  return new Date().toISOString();
}
