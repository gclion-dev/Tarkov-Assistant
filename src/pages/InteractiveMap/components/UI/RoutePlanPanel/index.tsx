import type { GeneratedRoutePlan } from '@/features/tasks/services/routePlanApi';
import useI18N from '@/i18n';

import './style.less';

interface RoutePlanPanelProps {
  lang: string;
  plan: GeneratedRoutePlan;
  onClose: () => void;
}

const RoutePlanPanel = ({ lang, plan, onClose }: RoutePlanPanelProps) => {
  const { t } = useI18N(lang);

  return (
    <aside className="im-route-plan" aria-label={t('tasks.planTitle')}>
      <div className="im-route-plan-head">
        <div>
          <div className="im-route-plan-kicker">{t('tasks.planTitle')}</div>
          <h2>{plan.mapName}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={t('tasks.planClose')}>
          ×
        </button>
      </div>
      {plan.summary && <p className="im-route-plan-summary">{plan.summary}</p>}
      {plan.bring.length > 0 && (
        <section>
          <h3>{t('tasks.planBring')}</h3>
          <ul>
            {plan.bring.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {plan.weapons.length > 0 && (
        <section>
          <h3>{t('tasks.planWeapons')}</h3>
          <ul>
            {plan.weapons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {plan.notes && (
        <section>
          <h3>{t('tasks.planNotes')}</h3>
          <p>{plan.notes}</p>
        </section>
      )}
      <section>
        <h3>{t('tasks.planStops')}</h3>
        {plan.nodes.length === 0 ? (
          <p className="im-route-plan-empty">{t('tasks.planEmptyRoute')}</p>
        ) : (
          <ol>
            {plan.nodes.map((node) => (
              <li key={node.key}>
                <div className="im-route-plan-stop-name">{node.taskName}</div>
                {node.action && <div className="im-route-plan-stop-action">{node.action}</div>}
                {node.bring.length > 0 && (
                  <div className="im-route-plan-stop-bring">{node.bring.join(' · ')}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
};

export default RoutePlanPanel;
