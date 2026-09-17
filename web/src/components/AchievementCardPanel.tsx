import { useEffect, useRef, useState } from 'react';
import type { AchievementCard, AchievementWiki, KbStatus } from '../../../shared/types.ts';
import { api, type ProfileQuery } from '../api.ts';
import { DLC_LABELS, describeHow, formatDate, UNLOCK_LABELS } from '../labels.ts';
import { AchievementIcon } from './AchievementIcon.tsx';
import { TextBlocks } from './TextBlocks.tsx';

export interface AchievementCardPanelProps {
  id: number;
  query: ProfileQuery;
  /** Change après une actualisation ou une synchro : la fiche est relue. */
  reloadKey: number;
  onClose(): void;
  onOpenSettings(): void;
}

type CardState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; card: AchievementCard };

function WikiSection({ wiki, syncedAt }: { wiki: AchievementWiki; syncedAt: string | null }) {
  const how = describeHow(wiki.how);
  const page = wiki.unlockPage;
  return (
    <>
      <section aria-labelledby="ach-card-condition">
        <h3 id="ach-card-condition">Condition</h3>
        <p lang="en">{wiki.condition}</p>
        {how && <p className="muted">{how}</p>}
      </section>

      <section aria-labelledby="ach-card-unlocks">
        <h3 id="ach-card-unlocks">Débloque</h3>
        <p>
          {UNLOCK_LABELS[wiki.unlocks.kind]} : <span lang="en">{wiki.unlocks.name}</span>
        </p>
        {page && (
          <>
            {page.effect && (
              <p lang="en" className="ach-card__effect">
                {page.effect}
              </p>
            )}
            {page.quality && <p className="muted">Qualité {page.quality}</p>}
            <TextBlocks blocks={page.intro} headingLevel={4} />
            <p>
              <a href={page.url} target="_blank" rel="noreferrer">
                Page «&nbsp;{page.title}&nbsp;» sur le wiki
              </a>
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="ach-card-tips">
        <h3 id="ach-card-tips">Astuces</h3>
        {wiki.tips.length === 0 ? (
          <p className="muted">Le wiki ne donne pas d'astuce pour ce succès.</p>
        ) : (
          wiki.tips.map((source) => (
            <section key={source.page} className="tip-source">
              <h4>
                <a href={source.url} target="_blank" rel="noreferrer" lang="en">
                  {source.page}
                </a>
              </h4>
              {source.sections.map((section, index) => (
                <div key={index} className="tip-section">
                  <h5 lang="en">{section.title}</h5>
                  <TextBlocks blocks={section.blocks} headingLevel={6} />
                  {section.truncated && (
                    <p>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        Suite sur le wiki
                      </a>
                    </p>
                  )}
                </div>
              ))}
            </section>
          ))
        )}
      </section>

      <p className="ach-card__source">
        Source :{' '}
        <a href={wiki.sourceUrl} target="_blank" rel="noreferrer">
          wiki The Binding of Isaac: Rebirth
        </a>{' '}
        (Fandom, licence CC BY-SA){syncedAt && `, synchro du ${formatDate(syncedAt)}`}.
      </p>
    </>
  );
}

function MissingWiki({ kb, onOpenSettings }: { kb: KbStatus; onOpenSettings(): void }) {
  if (kb.state === 'ok') return <p className="muted">Ce succès ne figure pas sur le wiki.</p>;
  return (
    <div className="banner banner--info">
      <p>{kb.state === 'absent' ? "La base wiki n'est pas encore téléchargée." : (kb.message ?? 'Base wiki inutilisable.')}</p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        Ouvrir les paramètres
      </button>
    </div>
  );
}

/** Fiche détaillée d'un succès, affichée à côté de la liste. */
export function AchievementCardPanel({ id, query, reloadKey, onClose, onOpenSettings }: AchievementCardPanelProps) {
  const [state, setState] = useState<CardState>({ status: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);
  const { profile, slot } = query;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'ready' && prev.card.achievement.id === id ? prev : { status: 'loading' }));
    api.achievement(id, { profile, slot }, controller.signal).then(
      (card) => setState({ status: 'ready', card }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => controller.abort();
  }, [id, profile, slot, reloadKey]);

  const achievement = state.status === 'ready' ? state.card.achievement : null;

  return (
    <aside
      className="card ach-card"
      aria-labelledby="ach-card-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="ach-card__head">
        <h2 id="ach-card-title" ref={heading} tabIndex={-1}>
          {achievement ? achievement.name : `Succès #${id}`}
        </h2>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Fermer la fiche
        </button>
      </div>

      {state.status === 'loading' && <p className="placeholder">Chargement de la fiche…</p>}
      {state.status === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && achievement && (
        <>
          <div className="ach-card__summary">
            <AchievementIcon file={achievement.icon} alt="" />
            <div>
              <p className="ach-card__meta">
                <span className="ach__id">#{achievement.id}</span>
                <span className="tag">{DLC_LABELS[achievement.dlc]}</span>
                {achievement.hidden && <span className="tag">secret</span>}
              </p>
              <p className="ach-card__state">
                {achievement.unlocked ? (
                  achievement.unlockedAt ? (
                    <>
                      Débloqué le <time dateTime={achievement.unlockedAt}>{formatDate(achievement.unlockedAt)}</time>
                    </>
                  ) : (
                    'Débloqué'
                  )
                ) : (
                  <span className="ach__state--missing">Manquant</span>
                )}
              </p>
            </div>
          </div>
          <p lang="en">{achievement.description}</p>
          {state.card.wiki ? (
            <WikiSection wiki={state.card.wiki} syncedAt={state.card.kb.syncedAt} />
          ) : (
            <MissingWiki kb={state.card.kb} onOpenSettings={onOpenSettings} />
          )}
        </>
      )}
    </aside>
  );
}
