import './styles/main.css';
import './styles/print.css';
import { mount, go } from './ui/app';
import './ui/screens/home';
import './ui/screens/setup';
import './ui/screens/play';
import './ui/screens/myshop';
import './ui/screens/adult';
import { registerServiceWorker } from './services/sw-register';

const root = document.getElementById('app');
if (root) {
  mount(root);
  go('home', {}, false);
}
registerServiceWorker();
