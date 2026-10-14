// RU: Выбирает только объявленные настройки размещения; JSON имеет приоритет, нейтральные умолчания не знают конкретной машины.
// EN: Selects only declared deployment settings; JSON takes precedence and neutral defaults are independent of a particular machine.
import path from 'node:path';
export function deploymentSettings(config,json={}) {
  const workspace=path.resolve(config.workspace??process.cwd());
  const get=(key,fallback)=>json[key]??config[key]??fallback;
  const result={
    coordinatorTrustFile:get('coordinatorTrustFile',''),
    mailStopConfigFile:get('mailStopConfigFile',''),
    pauseStateRoot:get('pauseStateRoot',path.join(workspace,'.pause-state')),
    compactSettingsRoot:get('compactSettingsRoot',''),
    receiptReviewer:get('receiptReviewer','координатор'),
    coordinatorReturnRecipient:get('coordinatorReturnRecipient',''),
    remoteReturnRecipients:get('remoteReturnRecipients',{}),
    remoteCourierEnvKey:get('remoteCourierEnvKey','A2A_TELL_DIR'),
    sharedSenderName:get('sharedSenderName','shared-user'),
    siteSpoolDir:get('siteSpoolDir',config.site?.spoolDir??path.join(workspace,'.site-spool')),
    siteStateFile:get('siteStateFile',config.site?.stateFile??path.join(workspace,'.site-state','closed')),
  };
  for(const key of ['coordinatorTrustFile','mailStopConfigFile','pauseStateRoot','compactSettingsRoot','siteSpoolDir','siteStateFile'])if(typeof result[key]!=='string'||(result[key]&&!path.isAbsolute(result[key])))throw Error(key+' must be empty or an absolute path');
  for(const key of ['pauseStateRoot','siteSpoolDir','siteStateFile'])if(!result[key])throw Error(key+' must be a nonempty absolute path');
  if(typeof result.receiptReviewer!=='string'||!result.receiptReviewer.trim()||result.receiptReviewer.length>128||/[\r\n]/.test(result.receiptReviewer))throw Error('receiptReviewer must be a bounded single-line label');
  for(const key of ['coordinatorReturnRecipient','sharedSenderName'])if(typeof result[key]!=='string'||(result[key]&&!/^[a-z][a-z0-9_-]{0,63}$/.test(result[key])))throw Error(key+' must be empty or an agent name');
  if(typeof result.remoteCourierEnvKey!=='string'||!/^[A-Z_][A-Z0-9_]*$/.test(result.remoteCourierEnvKey))throw Error('remoteCourierEnvKey must be an environment key name');
  if(result.remoteCourierEnvKey==='A2A_ZERKALO')throw Error('remoteCourierEnvKey is reserved for the mirror');
  const routes=result.remoteReturnRecipients;
  if(!routes||typeof routes!=='object'||Array.isArray(routes)||Object.entries(routes).some(([a,b])=>!/^[a-z][a-z0-9_-]{0,63}$/.test(a)||typeof b!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(b)))throw Error('remoteReturnRecipients must map agent names to courier recipients');
  return result;
}
