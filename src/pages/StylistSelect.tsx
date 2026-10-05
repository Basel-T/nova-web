// ============================================================
// StylistSelect.tsx — Step 2 of booking: pick a barber
// ============================================================

import { getStylists, getServiceById, formatPrice, useStoreVersion } from '../store';
import { Avatar, TopBar } from '../components';

interface Props {
  serviceId: string;
  onSelect: (stylistId: string) => void;
  onBack: () => void;
}

export default function StylistSelect({ serviceId, onSelect, onBack }: Props) {
  useStoreVersion(); // re-render if the admin adds/removes barbers
  const stylists = getStylists();
  const service = getServiceById(serviceId);

  return (
    <div className="min-h-screen bg-stone-100">
      <TopBar title="Choose Your Barber" subtitle="Step 2 of 3" onBack={onBack} />

      <div className="max-w-lg mx-auto px-4 py-6">
        {service && (
          <div className="bg-neutral-900 text-white rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
            <span className="text-sm">
              {service.icon} {service.name} · {service.duration_min} min
            </span>
            <span className="font-display text-amber-400 text-lg">{formatPrice(service.price)}</span>
          </div>
        )}

        {stylists.length === 0 && (
          <div className="bg-white rounded-3xl p-8 text-center text-neutral-400">No barbers available yet.</div>
        )}

        <div className="space-y-3">
          {stylists.map((stylist) => (
            <button
              key={stylist.id}
              onClick={() => onSelect(stylist.id)}
              className="w-full bg-white rounded-3xl shadow-sm p-4 flex items-center gap-4 text-left
                         border border-stone-200 hover:shadow-md hover:border-amber-400
                         transition-all active:scale-[0.98]"
            >
              <Avatar stylist={stylist} size="lg" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-neutral-900">{stylist.name}</h3>
                <p className="text-neutral-500 text-sm mt-0.5">{stylist.title}</p>
              </div>
              <span className="text-neutral-300 text-2xl">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
