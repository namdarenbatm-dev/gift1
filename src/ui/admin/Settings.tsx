import { useRef } from 'react';
import { ENGINE_VERSION } from '../../domain/types';
import { formatInt } from '../../domain/numbers';
import { downloadText, stamp } from '../download';
import { useCore } from '../core';
import { Icon } from '../icons';
import { PageHead } from '../widgets';
import { useAdmin } from './context';

declare const __BUILD_ID__: string;

export function Settings() {
  const { data } = useAdmin();
  const { exec, confirm, toast, repo } = useCore();
  const file = useRef<HTMLInputElement>(null);
  const empty = data.campaigns.length === 0 && data.agents.length === 0;

  async function loadDemo() {
    await exec({ type: 'loadDemoData' }, 'داده‌ی نمونه بارگذاری شد. نام‌ها با «نمونه» مشخص شده‌اند.');
  }

  async function reset() {
    const ok = await confirm({
      title: 'پاک‌سازی همه‌ی داده‌ها',
      body: (
        <>
          <p>
            همه‌ی کمپین‌ها، کارگزاران، فروش‌ها و پرداخت‌های ذخیره‌شده در این مرورگر حذف می‌شود. این کار برگشت‌پذیر نیست؛ اگر نیاز دارید، ابتدا پشتیبان بگیرید.
          </p>
        </>
      ),
      confirmLabel: 'پاک‌سازی',
      danger: true,
    });
    if (ok) await exec({ type: 'resetAll' }, 'همه‌ی داده‌ها پاک شد.');
  }

  function backup() {
    downloadText(`techno-campgain-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    toast('فایل پشتیبان ساخته شد.');
  }

  async function restore(f: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      toast('فایل انتخاب‌شده JSON معتبر نیست.', 'error');
      return;
    }
    const ok = await confirm({ title: 'بازیابی از پشتیبان', body: 'داده‌های فعلی با محتوای فایل جایگزین می‌شود.', confirmLabel: 'بازیابی', danger: true });
    if (ok) await exec({ type: 'importState', state: { ...(parsed as object), processed: {} } }, 'داده‌ها بازیابی شد.');
  }

  return (
    <>
      <PageHead title="تنظیمات" sub="داده‌ها، پشتیبان‌گیری و اطلاعات نسخه" />

      <section className="card note-card">
        <h2>این نسخه، پایلوت اعتبارسنجی قواعد کمپین است</h2>
        <ul className="plain-list">
          <li>داده‌ها فقط در حافظه‌ی همین مرورگر ذخیره می‌شوند و بین دستگاه‌ها یا کاربران هم‌گام نمی‌شوند.</li>
          <li>انتخاب «پنل مدیریت» یا «پنل کارگزار» احراز هویت نیست و امنیت واقعی ندارد.</li>
          <li>برای استفاده‌ی چندکاربره و پرداخت واقعی، باید برنامه به بک‌اند با ورود امن متصل شود (راهنما در مستندات پروژه).</li>
          <li>با پاک‌کردن اطلاعات مرورگر، داده‌ها از بین می‌رود؛ از بخش زیر پشتیبان بگیرید.</li>
        </ul>
      </section>

      <section className="card">
        <h2>پشتیبان‌گیری</h2>
        <div className="btn-group">
          <button className="btn btn-light" onClick={backup} disabled={empty}>
            <Icon name="download" size={18} /> دریافت پشتیبان (JSON)
          </button>
          <button className="btn btn-light" onClick={() => file.current?.click()}>
            <Icon name="upload" size={18} /> بازیابی از پشتیبان
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint">
          {formatInt(data.campaigns.length)} کمپین · {formatInt(data.agents.length)} کارگزار · {formatInt(data.sales.length)} فروش · {formatInt(data.payouts.length)} پرداخت
        </p>
      </section>

      <section className="card">
        <h2>داده‌ی نمونه</h2>
        <p className="muted">برای آشنایی با سامانه می‌توانید یک کمپین و چند کارگزار نمونه بارگذاری کنید. این داده‌ها هیچ‌جا به‌عنوان مقدار پیش‌فرض فرم‌ها استفاده نمی‌شوند و فقط روی سامانه‌ی خالی بارگذاری می‌شوند.</p>
        <div className="btn-group">
          <button className="btn btn-light" onClick={loadDemo} disabled={!empty}>
            بارگذاری داده‌ی نمونه
          </button>
          <button className="btn btn-danger-ghost" onClick={reset} disabled={empty}>
            <Icon name="trash" size={18} /> پاک‌سازی همه‌ی داده‌ها
          </button>
        </div>
        {!empty && <p className="hint">برای بارگذاری داده‌ی نمونه، ابتدا همه‌ی داده‌ها را پاک کنید.</p>}
      </section>

      <section className="card">
        <h2>نصب روی گوشی</h2>
        <p className="muted">
          در iPhone: صفحه را در Safari باز کنید، دکمه‌ی اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید. در Android: از منوی Chrome گزینه‌ی «Install app» را بزنید.
        </p>
      </section>

      <section className="card">
        <h2>درباره‌ی نسخه</h2>
        <dl className="facts">
          <div>
            <dt>نام برنامه</dt>
            <dd>Techno Campgain</dd>
          </div>
          <div>
            <dt>نسخه‌ی موتور محاسبه</dt>
            <dd className="mono">{ENGINE_VERSION}</dd>
          </div>
          <div>
            <dt>شناسه‌ی ساخت</dt>
            <dd className="mono">{typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}</dd>
          </div>
          <div>
            <dt>محل ذخیره‌سازی</dt>
            <dd>{repo.kind === 'local' ? 'مرورگر همین دستگاه' : repo.kind === 'http' ? 'سرور' : 'حافظه'}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
