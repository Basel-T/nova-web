// ============================================================
// Privacy.tsx — "Privacy" link + sheet (what we store, why,
// how long, who to contact). A template the shop must review.
// ============================================================

import { useState } from 'react';
import { ChevronRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import { getSettings } from '../store';
import { Sheet, cx } from '../ui';
import { cleanNumber } from '../lib/util';
import { t, type MessageKey } from '../i18n';

const SECTIONS: [MessageKey, MessageKey][] = [
  ['privacy.whatTitle', 'privacy.what'],
  ['privacy.whyTitle', 'privacy.why'],
  ['privacy.howLongTitle', 'privacy.howLong'],
];

export function PrivacyLink({ variant = 'link', className }: { variant?: 'link' | 'row'; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'link' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx('underline decoration-white/20 underline-offset-4 transition-colors hover:text-cream', className)}
        >
          {t('privacy.link')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx('flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 text-start transition hover:bg-white/[0.04]', className)}
        >
          <ShieldCheck className="size-5 shrink-0 text-gold-300" strokeWidth={1.6} />
          <span className="flex-1 text-[15px] text-cream">{t('privacy.link')}</span>
          <ChevronRight className="size-4 text-ink-500 rtl:-scale-x-100" />
        </button>
      )}
      <PrivacySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = getSettings();
  const contact = settings.privacy_contact?.trim() || settings.phone;
  const isEmail = contact.includes('@');

  return (
    <Sheet open={open} onClose={onClose} title={t('privacy.title')} subtitle={settings.shop_name}>
      <p className="flex gap-2.5 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
        {t('privacy.template')}
      </p>

      <div className="mt-5 space-y-5">
        {SECTIONS.map(([title, body]) => (
          <section key={title}>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-300/90">{t(title)}</h4>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-200">{t(body)}</p>
          </section>
        ))}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-300/90">{t('privacy.whoTitle')}</h4>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-200">{t('privacy.who')}</p>
          <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[15px]">
            <p className="font-medium text-cream">{settings.shop_name}</p>
            {settings.address && <p className="text-ink-300">{settings.address}</p>}
            {contact ? (
              <a
                href={isEmail ? `mailto:${contact}` : `tel:${cleanNumber(contact)}`}
                dir="ltr"
                className="mt-1 inline-block break-all text-gold-300 underline decoration-gold-300/30 underline-offset-4"
              >
                {contact}
              </a>
            ) : (
              <p className="mt-1 text-ink-300">{t('privacy.askInShop')}</p>
            )}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
