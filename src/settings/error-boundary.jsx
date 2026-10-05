import React from 'react';
import { t } from '../i18n.js';
import { logMessage } from '../api.js';

/* Keep navigation alive after a panel fails; never reset or overwrite config. */
export class SettingsBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { logMessage('error', `settings render failed: ${error.name}`); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="settings-recovery" role="alert">
      <p>{t('hotfix.settingsFailed')}</p>
      <button className="s-btn" onClick={() => this.setState({ failed: false })}>{t('focus.retry')}</button>
      {this.props.onHome && <button className="s-btn s-btn-soft" onClick={this.props.onHome}>{t('overhaul.home')}</button>}
    </section>;
  }
}
