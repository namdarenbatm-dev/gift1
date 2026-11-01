# وصل کردن بک‌اند واقعی

قرارداد در `src/data/repository.ts` تعریف شده و `src/data/httpRepository.ts` آن را روی HTTP پیاده می‌کند.

| Endpoint | کار |
|---|---|
| `GET /api/admin/snapshot` | وضعیت کامل برای مدیریت (فقط نقش مدیر) |
| `GET /api/agents/{id}/snapshot` | مدل خواندنیِ حداقلیِ کارگزار (فقط خود او) |
| `POST /api/commands` | یک `Envelope` (`type`, `idempotencyKey`, payload) → `CommandResult` |

قواعد سمت سرور:
1. احراز هویت و نقش‌ها (کارگزار هرگز `admin snapshot` نمی‌گیرد؛ دستورهای مدیریتی برای او `FORBIDDEN`).
2. اجرای `applyCommand` از `src/domain` (همان کد، بدون تغییر) داخل تراکنش با قفل خوش‌بینانه روی `version`.
3. ذخیره‌ی `idempotencyKey`ها؛ تکرار همان کلید همان نتیجه را بدهد.
4. رمزها/توکن‌ها فقط سمت سرور.

اعتبارسنجی: `startReferenceServer` در `server/reference-server.ts` نمونه‌ی کار است و `tests/contract.test.ts` همان مجموعه تست را روی آن اجرا می‌کند. همین تست باید روی سرور واقعی شما بدون تغییر سبز شود.
