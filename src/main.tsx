import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
class AppBoundary extends Component<{children:ReactNode},{error:string}>{
  state={error:''};
  static getDerivedStateFromError(error:Error){return {error:error.message};}
  render(){return this.state.error?<main className="fatal-error"><h1>TOUCHLINEを開けませんでした</h1><p>{this.state.error}</p><button onClick={()=>window.location.reload()}>再読み込み</button><button onClick={()=>{localStorage.removeItem('touchline.project.v1');window.location.reload();}}>保存データをリセットして再開</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<StrictMode><AppBoundary><App/></AppBoundary></StrictMode>);
