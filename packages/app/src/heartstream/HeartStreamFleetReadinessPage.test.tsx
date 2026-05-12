// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import type { Device, Location, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderAppRoutes, screen, userEvent, waitFor } from '../test-utils/render';
import { HEARTSTREAM_DEMO_TAG_CODE, HEARTSTREAM_DEMO_TAG_SYSTEM } from './heartstream-utils';

const demoTag = {
  system: HEARTSTREAM_DEMO_TAG_SYSTEM,
  code: HEARTSTREAM_DEMO_TAG_CODE,
  display: 'HeartStream Fleet Readiness demo',
};

describe('HeartStreamFleetReadinessPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    medplum.router.router.add('POST', '$heartstream-demo', async (req) => {
      const action = (req.body as Parameters).parameter?.find((param) => param.name === 'action')?.valueString;
      if (action === 'seed') {
        await createDemoDevice('North Lobby', 'HeartStream AED - North Lobby', 'HS-NL-1001');
      } else if (action === 'simulate-event') {
        const device = (await medplum.searchResources<Device>('Device', '_count=1'))[0];
        await medplum.createResource({
          resourceType: 'Observation',
          meta: { tag: [demoTag] },
          status: 'final',
          code: { text: 'Low battery' },
          device: { reference: `Device/${device.id}`, display: device.deviceName?.[0]?.name },
          effectiveDateTime: new Date().toISOString(),
          valueCodeableConcept: { text: 'Attention needed' },
        });
        await medplum.createResource({
          resourceType: 'Task',
          meta: { tag: [demoTag] },
          status: 'requested',
          intent: 'order',
          code: { text: 'Replace AED battery' },
          description: 'Battery level is below the readiness threshold.',
          focus: { reference: `Device/${device.id}`, display: device.deviceName?.[0]?.name },
          authoredOn: new Date().toISOString(),
        });
        await medplum.createResource({
          resourceType: 'Communication',
          meta: { tag: [demoTag] },
          status: 'completed',
          category: [{ text: 'Low battery' }],
          about: [{ reference: `Device/${device.id}` }],
          sent: new Date().toISOString(),
          payload: [{ contentString: 'Maintenance alert: battery replacement required.' }],
        });
      }

      return [
        allOk,
        {
          resourceType: 'Parameters',
          parameter: [
            { name: 'message', valueString: 'Demo operation complete.' },
            { name: 'fhirTrace', valueString: '["Device/demo"]' },
          ],
        },
      ];
    });
  });

  afterEach(() => {
    act(() => cleanNotifications());
  });

  test('seeds persisted resources and simulates a readiness event', async () => {
    renderAppRoutes(medplum, '/heartstream/fleet-readiness');

    expect(await screen.findByRole('heading', { name: 'HeartStream Fleet Readiness' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Seed demo fleet' }));

    expect(await screen.findByText('HeartStream AED - North Lobby')).toBeInTheDocument();
    expect(screen.getByText('North Lobby')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Simulate event' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Simulate event' }));

    expect(await screen.findByText('Replace AED battery')).toBeInTheDocument();
    expect(screen.getByText('Maintenance alert: battery replacement required.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('["Device/demo"]')).toBeInTheDocument();
  });

  async function createDemoDevice(siteName: string, deviceName: string, serialNumber: string): Promise<void> {
    const location = await medplum.createResource<Location>({
      resourceType: 'Location',
      meta: { tag: [demoTag] },
      status: 'active',
      name: siteName,
    });
    await medplum.createResource<Device>({
      resourceType: 'Device',
      meta: { tag: [demoTag] },
      status: 'active',
      deviceName: [{ name: deviceName, type: 'user-friendly-name' }],
      serialNumber,
      location: { reference: `Location/${location.id}`, display: location.name },
    });
  }
});
