import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { Briefcase, List, MapPin } from 'lucide-react';
import { USERS, type Apartment, type Status } from '../../shared/types';
import { overBudget } from '../../shared/workflow';
import { useApp } from '../state';
import { money } from '../lib/format';
import { Img, STATUS_DOT, StatusBadge } from '../components/ui';
import { CommuteChips, maxCommute } from '../components/Commute';
import { userKey } from '../i18n/strings';

// Keyless OpenStreetMap tiles by default. To use a keyed provider (MapTiler, Stadia…), set
// VITE_MAP_TILES_URL (and VITE_MAP_TILES_ATTRIBUTION) on Vercel – they're baked in at build time.
const TILES = import.meta.env.VITE_MAP_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  import.meta.env.VITE_MAP_TILES_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TEL_AVIV: L.LatLngTuple = [32.0853, 34.7818];

function pin(apt: Apartment, active: boolean, over: boolean) {
  const color = STATUS_DOT[apt.status as Status];
  const label = apt.price ? `₪${Math.round(apt.price / 100) / 10}K` : '•';
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-100%)" class="flex flex-col items-center">
      <div class="whitespace-nowrap rounded-full px-2.5 h-7 flex items-center gap-1 text-xs font-bold shadow-float ${
        active ? 'bg-ink text-white scale-110' : 'bg-white text-ink'
      }" style="border:2px solid ${over ? '#E5484D' : color}">
        <span style="width:7px;height:7px;border-radius:9px;background:${color}"></span>${label}
      </div>
      <div style="width:2px;height:8px;background:${color}"></div>
    </div>`,
  });
}

const workIcon = (letters: string, bg: string) =>
  L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);background:${bg}" class="flex h-9 w-9 items-center justify-center rounded-2xl text-white text-xs font-bold shadow-float ring-2 ring-white">${letters}</div>`,
  });

export default function MapView() {
  const { t, lang, apartments, settings } = useApp();
  const nav = useNavigate();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layer = useRef<L.LayerGroup>();
  const [active, setActive] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const visible = useMemo(
    () => apartments.filter((a) => showRejected || a.status !== 'rejected'),
    [apartments, showRejected],
  );
  const located = visible.filter((a) => a.geo);
  const sorted = [...located].sort((a, b) => maxCommute(a) - maxCommute(b));

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(TEL_AVIV, 12);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, className: 'map-tiles' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = undefined; };
  }, []);

  // Draw markers
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const a of located) {
      const ll: L.LatLngTuple = [a.geo!.lat, a.geo!.lng];
      bounds.push(ll);
      L.marker(ll, { icon: pin(a, a.id === active, overBudget(a, settings?.budget) > 0), zIndexOffset: a.id === active ? 1000 : 0 })
        .on('click', () => {
          setActive(a.id);
          document.getElementById(`map-card-${a.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        })
        .addTo(g);
    }
    USERS.forEach((u, i) => {
      const w = settings?.work[u];
      if (w?.lat == null || w.lng == null) return;
      bounds.push([w.lat, w.lng]);
      L.marker([w.lat, w.lng], { icon: workIcon(t(userKey(u)).slice(0, 2), i ? '#FF6B8B' : '#1F4BFF') })
        .bindTooltip(`${t('work')} · ${t(userKey(u))}`)
        .addTo(g);
    });
    if (!active && bounds.length) m.fitBounds(bounds, { paddingTopLeft: [40, 110], paddingBottomRight: [40, 260], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((a) => `${a.id}${a.geo?.lat}${a.status}`).join(), active, settings, lang]);

  const focus = (a: Apartment) => {
    setActive(a.id);
    if (a.geo) map.current?.flyTo([a.geo.lat, a.geo.lng], Math.max(map.current.getZoom(), 15), { duration: 0.6 });
  };

  const hasWork = USERS.some((u) => settings?.work[u]?.lat != null);
  const missing = visible.length - located.length;

  return (
    <main className="fixed inset-0 z-0">
      <div ref={el} className="absolute inset-0 bg-mist" />

      <div className="absolute inset-x-0 top-0 z-[500] px-4 pt-safe pointer-events-none">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 pt-2">
          <Link to="/" className="chip pointer-events-auto"><List size={16} /> {t('list')}</Link>
          <div className="flex gap-2 pointer-events-auto">
            {!hasWork && (
              <Link to="/settings" className="chip"><Briefcase size={16} /> {t('commuteSetup')}</Link>
            )}
            <button className={`chip ${showRejected ? 'chip-active' : ''}`} onClick={() => setShowRejected((s) => !s)}>
              {t('status.rejected')}
            </button>
          </div>
        </div>
        {missing > 0 && (
          <p className="mx-auto mt-2 w-fit rounded-full bg-white/90 px-3 py-1 text-xs text-ink/60 shadow-card">
            <MapPin size={12} className="inline" /> {t('notOnMap', { n: missing })}
          </p>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-28 z-[500]">
        <div className="mx-auto flex max-w-2xl snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
          {sorted.map((a) => (
            <button
              key={a.id}
              id={`map-card-${a.id}`}
              onClick={() => (active === a.id ? nav(`/apt/${a.id}`) : focus(a))}
              className={`card snap-center flex w-72 shrink-0 gap-3 overflow-hidden !rounded-3xl p-2 text-start transition ${
                active === a.id ? 'ring-2 ring-ink' : ''
              }`}
            >
              <Img src={a.images[0]} className="h-20 w-20 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 py-1">
                <div className="truncate font-semibold">{a.title}</div>
                <div className="text-sm text-ink/60">{money(a.price, lang)}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <CommuteChips apt={a} />
                  {!a.commute && <StatusBadge status={a.status} className="!h-6" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
