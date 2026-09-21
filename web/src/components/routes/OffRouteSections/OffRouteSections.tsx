import type { OffRoute } from '@shared/types.ts';
import { OffRouteChallenges } from '@/components/routes/OffRouteChallenges/OffRouteChallenges.tsx';
import { OffRouteClosets } from '@/components/routes/OffRouteClosets/OffRouteClosets.tsx';
import { OffRouteCounters } from '@/components/routes/OffRouteCounters/OffRouteCounters.tsx';
import { OffRouteMisc } from '@/components/routes/OffRouteMisc/OffRouteMisc.tsx';
import { useT } from '@/i18n.tsx';

export interface OffRouteSectionsProps {
  offRoute: OffRoute;
  onOpen(id: number): void;
}

/** The achievements no planned run earns, each family behind its own summary. */
export function OffRouteSections({ offRoute, onOpen }: OffRouteSectionsProps) {
  const t = useT();
  return (
    <section className="off-route" aria-labelledby="off-route-title">
      <h2 id="off-route-title">{t('routes.offTitle')}</h2>
      <OffRouteChallenges challenges={offRoute.challenges} onOpen={onOpen} />
      <OffRouteCounters counters={offRoute.counters} onOpen={onOpen} />
      <OffRouteClosets closets={offRoute.closets} redKey={offRoute.redKey} onOpen={onOpen} />
      <OffRouteMisc misc={offRoute.misc} onOpen={onOpen} />
    </section>
  );
}
