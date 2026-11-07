import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LocaleProvider, useT } from './i18n';
import './styles.css';
function FatalError({ error }: { error: string }) {
  const t = useT();
  return <main className="fatal-error"><h1>{t('TOUCHLINEを開けませんでした')}</h1><p>{t(error)}</p><button onClick={()=>window.location.reload()}>{t('再読み込み')}</button><button onClick={()=>{localStorage.removeItem('touchline.project.v1');window.location.reload();}}>{t('保存データをリセットして再開')}</button></main>;
}
class AppBoundary extends Component<{children:ReactNode},{error:string}>{
  state={error:''};
  static getDerivedStateFromError(error:Error){return {error:error.message};}
  render(){return this.state.error?<FatalError error={this.state.error}/>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<StrictMode><LocaleProvider><AppBoundary><App/></AppBoundary></LocaleProvider></StrictMode>);
