// ============================================================
// ServiceSelect.tsx — Step 1 of booking: pick a service
// ============================================================
// Shows every active service with its price and duration.
// Tapping one moves on to choosing a barber.
// ============================================================

import { getServices, formatPrice, useStoreVersion } from '../store';
import { TopBar } from '../components';

interface Props {
  onSelect: (serviceId: string) => void;
  onBack: () => void;
}

export default function ServiceSelect({ onSelect, onBack }: Props) {
  useStoreVersion(); // re-render if the admin edits services
  const services = getServices();

  return (
    <div className="min-h-screen bg-stone-100">
      <TopBar title="Choose a Service" subtitle="Step 1 of 3" onBack={onBack} />

      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-neutral-500 mb-5 text-sm">What are we doing today?</p>

        {services.length === 0 && (
          <div className="bg-white rounded-3xl p-8 text-center text-neutral-400">No services available yet.</div>
        )}

        <div className="space-y-3">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 text-left
                         border border-stone-200 shadow-sm hover:shadow-md hover:border-amber-400
                         transition-all active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center text-2xl shrink-0">
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-neutral-900">{s.name}</h3>
                <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{s.description}</p>
                <p className="text-xs text-neutral-400 mt-1">⏱ {s.duration_min} min</p>
              </div>
              <div className="font-display text-xl font-semibold text-neutral-900 shrink-0">
                {formatPrice(s.price)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
