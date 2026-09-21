import { useT } from '@/i18n.tsx';

/** All that is left once the server has been told to stop: nothing more can be read. */
export function StoppedScreen() {
  const t = useT();
  return (
    <main className="stopped">
      <h1>{t('app.stoppedTitle')}</h1>
      <p>{t('app.stoppedText')}</p>
    </main>
  );
}
