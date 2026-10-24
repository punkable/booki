import React from 'react';
import { t } from '../i18n.js';
import { logMessage } from '../api.js';
import { InfoBar } from './ui.jsx';

/* Keep navigation alive after a panel fails; never reset or overwrite config. */
export class SettingsBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { logMessage('error', `settings render failed: ${error.name}`); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="settings-recovery"><InfoBar severity="error" action={<div className="settings-recovery-actions">
        <button type="button" className="button button-accent" onClick={() => this.setState({ failed: false })}>{t('focus.retry')}</button>
        {this.props.onHome && <button type="button" className="button" onClick={this.props.onHome}>{t('overhaul.home')}</button>}
      </div>}>{t('hotfix.settingsFailed')}</InfoBar></div>;
  }
}
