import { navigate } from '../../app/router';
import { Panel } from '../components/Panel';
import { OptionsForm } from './OptionsForm';
import { ScreenLayout } from './ScreenLayout';

export function OptionsScreen() {
  return (
    <ScreenLayout>
      <Panel labelledBy="options-title">
        <h1 id="options-title" className="panel-title">
          Options
        </h1>
        <OptionsForm backLabel="Main menu" onBack={() => navigate({ name: 'menu' })} />
      </Panel>
    </ScreenLayout>
  );
}
