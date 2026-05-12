// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Coding, CodeableConcept, Communication, Device, Location, Observation, Task } from '@medplum/fhirtypes';

export const HEARTSTREAM_DEMO_TAG_SYSTEM = 'https://medplum.com/demo/heartstream';
export const HEARTSTREAM_DEMO_TAG_CODE = 'fleet-readiness';
export const HEARTSTREAM_EVENT_SYSTEM = 'https://medplum.com/demo/heartstream/readiness-event';
export const HEARTSTREAM_STATUS_SYSTEM = 'https://medplum.com/demo/heartstream/readiness-status';

export type HeartStreamEventType = 'low-battery' | 'pads-expiring' | 'missed-check-in' | 'failed-self-test';

export interface HeartStreamDeviceInput {
  readonly siteName?: string;
  readonly deviceName?: string;
  readonly serialNumber?: string;
}

export interface HeartStreamEventDefinition {
  readonly code: HeartStreamEventType;
  readonly display: string;
  readonly readinessStatus: 'Ready' | 'Attention needed' | 'Maintenance due';
  readonly taskTitle: string;
  readonly taskDescription: string;
  readonly communication: string;
}

export const HEARTSTREAM_EVENT_DEFINITIONS: Record<HeartStreamEventType, HeartStreamEventDefinition> = {
  'low-battery': {
    code: 'low-battery',
    display: 'Low battery',
    readinessStatus: 'Attention needed',
    taskTitle: 'Replace AED battery',
    taskDescription: 'Battery level is below the readiness threshold. Replace and confirm device check-in.',
    communication: 'Maintenance alert: battery replacement required before the next readiness audit.',
  },
  'pads-expiring': {
    code: 'pads-expiring',
    display: 'Pads expiring soon',
    readinessStatus: 'Maintenance due',
    taskTitle: 'Replace electrode pads',
    taskDescription: 'Electrode pads expire soon. Schedule replacement and document completion.',
    communication: 'Compliance reminder: pads expiration window is approaching.',
  },
  'missed-check-in': {
    code: 'missed-check-in',
    display: 'Missed check-in',
    readinessStatus: 'Attention needed',
    taskTitle: 'Verify AED check-in',
    taskDescription: 'Device missed its expected readiness check-in. Inspect connectivity and cabinet status.',
    communication: 'Operations notice: device missed scheduled readiness check-in.',
  },
  'failed-self-test': {
    code: 'failed-self-test',
    display: 'Failed self-test',
    readinessStatus: 'Attention needed',
    taskTitle: 'Investigate self-test failure',
    taskDescription: 'Device reported a failed self-test. Dispatch maintenance for diagnostics.',
    communication: 'Maintenance alert: self-test failure needs follow-up.',
  },
};

export const HEARTSTREAM_BASELINE_FLEET: HeartStreamDeviceInput[] = [
  { siteName: 'North Lobby', deviceName: 'HeartStream AED - North Lobby', serialNumber: 'HS-NL-1001' },
  { siteName: 'Warehouse East', deviceName: 'HeartStream AED - Warehouse East', serialNumber: 'HS-WE-1002' },
  { siteName: 'Training Center', deviceName: 'HeartStream AED - Training Center', serialNumber: 'HS-TC-1003' },
];

export function heartStreamDemoTag(): Coding {
  return {
    system: HEARTSTREAM_DEMO_TAG_SYSTEM,
    code: HEARTSTREAM_DEMO_TAG_CODE,
    display: 'HeartStream Fleet Readiness demo',
  };
}

export function heartStreamCode(system: string, code: string, display: string): CodeableConcept {
  return {
    coding: [{ system, code, display }],
    text: display,
  };
}

export function createHeartStreamLocation(input: HeartStreamDeviceInput, index: number): Location {
  const siteName = input.siteName?.trim() || `HeartStream Site ${index + 1}`;
  return {
    resourceType: 'Location',
    meta: { tag: [heartStreamDemoTag()] },
    status: 'active',
    name: siteName,
    description: 'HeartStream AED readiness demo site',
    physicalType: heartStreamCode(HEARTSTREAM_STATUS_SYSTEM, 'aed-site', 'AED site'),
  };
}

export function createHeartStreamDevice(input: HeartStreamDeviceInput, location: WithId<Location>, index: number): Device {
  const deviceName = input.deviceName?.trim() || `HeartStream AED ${index + 1}`;
  return {
    resourceType: 'Device',
    meta: { tag: [heartStreamDemoTag()] },
    identifier: [{ system: HEARTSTREAM_DEMO_TAG_SYSTEM + '/serial', value: input.serialNumber || `HS-DEMO-${index + 1}` }],
    status: 'active',
    manufacturer: 'Philips',
    serialNumber: input.serialNumber || `HS-DEMO-${index + 1}`,
    deviceName: [{ name: deviceName, type: 'user-friendly-name' }],
    modelNumber: 'HeartStream FRx',
    type: heartStreamCode(HEARTSTREAM_STATUS_SYSTEM, 'aed', 'Automated external defibrillator'),
    location: { reference: `Location/${location.id}`, display: location.name },
    note: [{ text: 'Initial demo readiness state: Ready' }],
  };
}

export function createReadinessObservation(device: WithId<Device>, event: HeartStreamEventDefinition, now: string): Observation {
  return {
    resourceType: 'Observation',
    meta: { tag: [heartStreamDemoTag()] },
    status: 'final',
    code: heartStreamCode(HEARTSTREAM_EVENT_SYSTEM, event.code, event.display),
    subject: { reference: `Device/${device.id}`, display: getDeviceDisplay(device) },
    device: { reference: `Device/${device.id}`, display: getDeviceDisplay(device) },
    effectiveDateTime: now,
    valueCodeableConcept: heartStreamCode(HEARTSTREAM_STATUS_SYSTEM, event.code, event.readinessStatus),
  };
}

export function createReadinessTask(device: WithId<Device>, event: HeartStreamEventDefinition, now: string): Task {
  return {
    resourceType: 'Task',
    meta: { tag: [heartStreamDemoTag()] },
    status: 'requested',
    intent: 'order',
    code: heartStreamCode(HEARTSTREAM_EVENT_SYSTEM, event.code, event.taskTitle),
    description: event.taskDescription,
    focus: { reference: `Device/${device.id}`, display: getDeviceDisplay(device) },
    authoredOn: now,
  };
}

export function createReadinessCommunication(
  device: WithId<Device>,
  event: HeartStreamEventDefinition,
  now: string
): Communication {
  return {
    resourceType: 'Communication',
    meta: { tag: [heartStreamDemoTag()] },
    status: 'completed',
    category: [heartStreamCode(HEARTSTREAM_EVENT_SYSTEM, event.code, event.display)],
    about: [{ reference: `Device/${device.id}`, display: getDeviceDisplay(device) }],
    sent: now,
    payload: [{ contentString: event.communication }],
  };
}

export function getDeviceDisplay(device: Device): string {
  return device.deviceName?.[0]?.name || device.serialNumber || device.id || 'HeartStream AED';
}
