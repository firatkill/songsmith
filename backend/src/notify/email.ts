import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import type { Env } from '../lib/env.js';
export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
export class SmtpSender implements EmailSender {
  private readonly transport;
  constructor(
    private readonly env: Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'EMAIL_FROM'>,
  ) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  async send(message: EmailMessage) {
    await this.transport.sendMail({
      from: this.env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      messageId: `<${message.id}@songsmith.local>`,
    });
  }
}
export class ResendSender implements EmailSender {
  private readonly client: Resend;
  constructor(
    key: string,
    private readonly from: string,
  ) {
    this.client = new Resend(key);
  }
  async send(message: EmailMessage) {
    const result = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      { idempotencyKey: message.id },
    );
    if (result.error) throw new Error('Email request failed');
  }
}
