// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, Device, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { HEARTSTREAM_DEMO_TAG_CODE, HEARTSTREAM_DEMO_TAG_SYSTEM } from './heartstreamdemo-data';

const tagToken = `${HEARTSTREAM_DEMO_TAG_SYSTEM}|${HEARTSTREAM_DEMO_TAG_CODE}`;

describe('$heartstream-demo', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('seeds, simulates, and resets tagged HeartStream demo resources', async () => {
    const accessToken = await initTestAuth();

    const seed = await callOperation(accessToken, { action: 'seed' });
    expect(seed.status).toBe(200);
    expect(getOutput(seed.body, 'created')).toBeGreaterThan(0);

    const devices = await searchTaggedDevices(accessToken);
    expect(devices.entry).toHaveLength(3);

    const simulate = await callOperation(accessToken, {
      action: 'simulate-event',
      deviceId: devices.entry?.[0]?.resource?.id,
      eventType: 'failed-self-test',
    });
    expect(simulate.status).toBe(200);
    expect(getOutput(simulate.body, 'message')).toContain('failed self-test');

    const untagged = await request(app)
      .post('/fhir/R4/Device')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Device', status: 'active', serialNumber: 'NOT-DEMO' } satisfies Device);
    expect(untagged.status).toBe(201);

    const reset = await callOperation(accessToken, { action: 'reset' });
    expect(reset.status).toBe(200);
    expect(getOutput(reset.body, 'deleted')).toBeGreaterThan(0);
    expect((await searchTaggedDevices(accessToken)).entry ?? []).toHaveLength(0);

    const preserved = await request(app)
      .get(`/fhir/R4/Device/${untagged.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(preserved.status).toBe(200);
  });

  test('creates a manually entered AED site with initial readiness state', async () => {
    const accessToken = await initTestAuth();

    const result = await callOperation(accessToken, {
      action: 'create-device',
      siteName: 'Demo Atrium',
      deviceName: 'Atrium AED',
      serialNumber: 'HS-ATRIUM-1',
    });
    expect(result.status).toBe(200);
    expect(getOutput(result.body, 'created')).toBe(3);

    const devices = await searchTaggedDevices(accessToken);
    expect(devices.entry?.some((entry) => entry.resource?.serialNumber === 'HS-ATRIUM-1')).toBe(true);
  });

  function callOperation(accessToken: string, input: Record<string, string | undefined>): request.Test {
    return request(app)
      .post('/fhir/R4/$heartstream-demo')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: Object.entries(input).flatMap(([name, value]) => (value ? [{ name, valueString: value }] : [])),
      } satisfies Parameters);
  }

  async function searchTaggedDevices(accessToken: string): Promise<Bundle<Device>> {
    const result = await request(app)
      .get(`/fhir/R4/Device?_tag=${encodeURIComponent(tagToken)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(result.status).toBe(200);
    return result.body;
  }

  function getOutput(body: Parameters, name: string): string | number | undefined {
    const parameter = body.parameter?.find((param) => param.name === name);
    return parameter?.valueString ?? parameter?.valueInteger;
  }
});
