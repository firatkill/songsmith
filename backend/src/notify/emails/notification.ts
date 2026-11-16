import { createElement as h } from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
} from '@react-email/components';
import { render, toPlainText } from '@react-email/render';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import type { NotificationKind } from '@songsmith/schemas';
export async function renderNotificationEmail(
  locale: Locale,
  kind: NotificationKind,
  payload: { title?: string | undefined; jobId?: string | undefined },
  webUrl: string,
) {
  const subject = t(locale, `notification.kind.${kind}`);
  const body = t(locale, `notification.text.${kind}`, {
    title: payload.title ?? '',
  });
  const url = new URL(
    payload.jobId
      ? `/${locale}/create/jobs/${payload.jobId}`
      : `/${locale}/notifications`,
    webUrl,
  ).href;
  const html = await render(
    h(
      Html,
      { lang: locale },
      h(Head),
      h(Preview, null, subject),
      h(
        Body,
        {
          style: {
            backgroundColor: '#fff9e8',
            fontFamily: 'Arial, sans-serif',
            color: '#171717',
          },
        },
        h(
          Container,
          {
            style: {
              padding: '32px',
              border: '2px solid #171717',
              borderRadius: '14px',
              backgroundColor: '#ffffff',
            },
          },
          h(Text, null, t(locale, 'web.brand')),
          h(Heading, null, subject),
          h(Text, null, body),
          h(
            Button,
            {
              href: url,
              style: {
                backgroundColor: '#ffe34d',
                color: '#171717',
                padding: '14px 24px',
                border: '2px solid #171717',
                borderRadius: '10px',
              },
            },
            t(locale, 'notification.open'),
          ),
          h(
            Text,
            {
              style: { color: '#5c5c5c', fontSize: '13px', marginTop: '24px' },
            },
            t(locale, 'notification.emailFooter'),
          ),
        ),
      ),
    ),
  );
  return { subject, html, text: toPlainText(html) };
}
