import { expoTicketSchema } from '@songsmith/schemas';
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { jobId?: string };
}
export type PushResult = 'sent' | 'failed' | 'unregistered';
export interface PushSender {
  send(message: PushMessage): Promise<PushResult>;
}
export class MockPushSender implements PushSender {
  readonly messages: PushMessage[] = [];
  send(message: PushMessage): Promise<PushResult> {
    this.messages.push(structuredClone(message));
    return Promise.resolve('sent');
  }
}
export class ExpoPushSender implements PushSender {
  constructor(
    private readonly accessToken: string,
    private readonly http: typeof fetch = fetch,
  ) {}
  async send(message: PushMessage): Promise<PushResult> {
    const response = await this.http('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Push request failed');
    const ticket = expoTicketSchema.parse(await response.json()).data;
    return ticket.status === 'ok'
      ? 'sent'
      : ticket.details?.error === 'DeviceNotRegistered'
        ? 'unregistered'
        : 'failed';
  }
}
