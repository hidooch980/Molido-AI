import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type N8nEventType =
  | 'sale.created'
  | 'sale.cancelled'
  | 'purchase.created'
  | 'payment.created'
  | 'expense.created'
  | 'inventory.low_stock'
  | 'complaint.created'
  | 'complaint.resolved'
  | 'cheque.bounced'
  | 'cheque.due_soon'
  | 'installment.overdue'
  | 'municipal_bill.created'
  | 'pos.status_changed'
  | 'user.registered'
  | 'fire.incident_created';

export interface N8nPayload {
  event: N8nEventType;
  timestamp: string;
  companyId?: string;
  data: Record<string, unknown>;
}

/**
 * سرویس ارسال رویدادها به n8n
 *
 * وقتی یک رویداد اتفاق می‌افتد (ثبت فروش، شکایت جدید، ...)
 * بسته به وب‌هوک n8n ارسال می‌شود.
 * n8n می‌تواند آن را به Telegram، ایمیل، Slack، Google Sheets، ...
 * وصل کند.
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly webhookUrl: string;
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    const base =
      this.config.get<string>('N8N_BASE_URL') ?? 'http://localhost:5678';

    this.webhookUrl = `${base}/webhook/molido`;
    this.secret =
      this.config.get<string>('N8N_WEBHOOK_SECRET') ?? 'molido_n8n_secret';
  }

  /**
   * ارسال رویداد به n8n — در صورت خطا فقط لاگ می‌شود و برنامه متوقف نمی‌شود
   */
  async emit(event: N8nEventType, data: Record<string, unknown>, companyId?: string): Promise<void> {
    const payload: N8nPayload = {
      event,
      timestamp: new Date().toISOString(),
      companyId,
      data,
    };

    try {
      const response = await (globalThis as unknown as { fetch: typeof fetch }).fetch(
        this.webhookUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-molido-secret': this.secret,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `n8n webhook responded ${response.status} for event "${event}"`,
        );
      } else {
        this.logger.debug(`n8n event "${event}" sent to ${this.webhookUrl}`);
      }
    } catch (error) {
      // خطا در ارسال به n8n باید برنامه اصلی را متوقف نکند
      this.logger.warn(
        `Failed to send n8n event "${event}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ---------- shortcut helpers ----------

  saleCreated(sale: Record<string, unknown>, companyId: string) {
    return this.emit('sale.created', sale, companyId);
  }

  saleCancelled(sale: Record<string, unknown>, companyId: string) {
    return this.emit('sale.cancelled', sale, companyId);
  }

  purchaseCreated(purchase: Record<string, unknown>, companyId: string) {
    return this.emit('purchase.created', purchase, companyId);
  }

  paymentCreated(payment: Record<string, unknown>, companyId: string) {
    return this.emit('payment.created', payment, companyId);
  }

  expenseCreated(expense: Record<string, unknown>, companyId: string) {
    return this.emit('expense.created', expense, companyId);
  }

  inventoryLowStock(items: unknown[], companyId: string) {
    return this.emit('inventory.low_stock', { items, count: items.length }, companyId);
  }

  complaintCreated(complaint: Record<string, unknown>, companyId?: string) {
    return this.emit('complaint.created', complaint, companyId);
  }

  complaintResolved(complaint: Record<string, unknown>, companyId?: string) {
    return this.emit('complaint.resolved', complaint, companyId);
  }

  chequeBounced(cheque: Record<string, unknown>, companyId: string) {
    return this.emit('cheque.bounced', cheque, companyId);
  }

  installmentOverdue(installment: Record<string, unknown>, companyId: string) {
    return this.emit('installment.overdue', installment, companyId);
  }

  municipalBillCreated(bill: Record<string, unknown>, companyId?: string) {
    return this.emit('municipal_bill.created', bill, companyId);
  }

  fireIncidentCreated(incident: Record<string, unknown>) {
    return this.emit('fire.incident_created', incident);
  }
}
