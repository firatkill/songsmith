import { describe, it, expect } from 'vitest';
import {
  creativeKinds,
  notificationKindSchema,
  notificationPrefsSchema,
  notificationPrefsPatchSchema,
  mergeNotificationPrefs,
  transactionalKinds,
} from '@songsmith/schemas';
import { messages } from '@songsmith/i18n';
import { channelSelection } from './index.js';
import { MockPushSender, ExpoPushSender } from './push.js';
import { renderNotificationEmail } from './emails/notification.js';
import { createLogger } from '../lib/log.js';
describe('T-21 notifications', () => {
  it('defaults and partial merges preserve unrelated preferences', () => {
    const defaults = notificationPrefsSchema.parse({});
    expect(Object.values(defaults.email).every((v) => !v)).toBe(true);
    for (const kind of creativeKinds) expect(defaults.push[kind]).toBe(true);
    const first = mergeNotificationPrefs(defaults, {
      email: { song_ready: true },
      push: { song_failed: false },
    });
    const patch = notificationPrefsPatchSchema.parse({
      email: { video_ready: true },
    });
    const next = mergeNotificationPrefs(first, patch);
    expect(next.email.song_ready).toBe(true);
    expect(next.email.video_ready).toBe(true);
    expect(next.push.song_failed).toBe(false);
  });
  it('selects channels by opt-in, devices and mandatory transactional mail', () => {
    const prefs = notificationPrefsSchema.parse({});
    for (const kind of transactionalKinds)
      expect(channelSelection(kind, prefs, 0).email).toBe(true);
    for (const kind of creativeKinds)
      expect(channelSelection(kind, prefs, 1)).toEqual({
        email: false,
        push: true,
      });
    expect(channelSelection('song_ready', prefs, 0).push).toBe(false);
    expect(
      channelSelection(
        'song_ready',
        mergeNotificationPrefs(prefs, {
          email: { song_ready: true },
          push: { song_ready: false },
        }),
        1,
      ),
    ).toEqual({ email: true, push: false });
  });
  it('has TR and EN labels and texts for all eleven kinds', () => {
    expect(notificationKindSchema.options).toHaveLength(11);
    for (const locale of ['tr', 'en'] as const)
      for (const kind of notificationKindSchema.options) {
        expect(messages[locale][`notification.kind.${kind}`]).toBeTruthy();
        expect(messages[locale][`notification.text.${kind}`]).toBeTruthy();
      }
  });
  it.each(['tr', 'en'] as const)(
    'renders %s email with a job link and plain text, without lyrics',
    async (locale) => {
      const id = '11111111-1111-4111-8111-111111111111';
      const email = await renderNotificationEmail(
        locale,
        'song_ready',
        { title: 'My title', jobId: id },
        'http://localhost:3000',
      );
      expect(email.html).toContain(`/${locale}/create/jobs/${id}`);
      expect(email.text).toContain(`/${locale}/create/jobs/${id}`);
      expect(email.html).not.toContain('lyrics');
      expect(email.subject).toBe(
        messages[locale]['notification.kind.song_ready'],
      );
    },
  );
  it('mock push records a copy of each message', async () => {
    const push = new MockPushSender();
    const message = {
      to: 'ExpoPushToken[test]',
      title: 'Ready',
      body: 'Song ready',
      data: {},
    };
    expect(await push.send(message)).toBe('sent');
    message.title = 'changed';
    expect(push.messages[0]?.title).toBe('Ready');
  });
  it('interprets Expo tickets without logging response bodies', async () => {
    const push = new ExpoPushSender('test', () =>
      Promise.resolve(
        Response.json({
          data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        }),
      ),
    );
    expect(
      await push.send({
        to: 'ExpoPushToken[test]',
        title: 'Ready',
        body: 'Ready',
        data: {},
      }),
    ).toBe('unregistered');
  });
  it('redacts title, email and token markers', () => {
    let logs = '';
    const logger = createLogger('info', {
      write: (chunk) => {
        logs += chunk;
      },
    });
    logger.info(
      {
        title: 'PRIVATE_TITLE_MARKER',
        email: 'private@example.test',
        expoPushToken: 'ExpoPushToken[PRIVATE_TOKEN_MARKER]',
        kind: 'song_ready',
      },
      'notification.delivered',
    );
    expect(logs).not.toContain('PRIVATE_');
    expect(logs).not.toContain('private@example.test');
    expect(logs).toContain('song_ready');
  });
});
