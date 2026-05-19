import { Route, Switch } from 'wouter';
import GeometricBackground from '@/components/GeometricBackground';
import CrtOverlay from '@/components/CrtOverlay';
import Navbar from '@/components/Navbar';
import ChiptuneToggle from '@/components/ChiptuneToggle';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import PlayerPage from '@/pages/PlayerPage';
import VersusPage from '@/pages/VersusPage';
import FriendsPage from '@/pages/FriendsPage';

export default function App() {
  return (
    <div className="relative min-h-screen">
      <GeometricBackground />
      <div className="relative z-10">
        <Navbar />
        <main>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/login" component={LoginPage} />
            <Route path="/leaderboard" component={LeaderboardPage} />
            <Route path="/player/:steamId" component={PlayerPage} />
            <Route path="/versus" component={VersusPage} />
            <Route path="/friends" component={FriendsPage} />
            <Route>
              <div className="mx-auto max-w-md px-4 py-24 text-center">
                <div className="neon-mag text-5xl uppercase">404</div>
                <div className="neon text-xl uppercase mt-2">SIGNAL LOST</div>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
      <ChiptuneToggle />
      <CrtOverlay />
    </div>
  );
}
