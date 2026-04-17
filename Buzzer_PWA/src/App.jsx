import { Navigate, Route, Routes } from 'react-router-dom'
import Configuration from './pages/host/Configuration.jsx'
import HostRound from './pages/host/HostRound.jsx'
import PlayersRoom from './pages/host/PlayersRoom.jsx'
import PlayerBuzzer from './pages/player/PlayerBuzzer.jsx'
import JoinGame from './pages/player/JoinGame.jsx'
import TeamSelection from './pages/player/TeamSelection.jsx'
import Mode from './pages/shared/Mode.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Mode />} />
      <Route path="/configuration" element={<Configuration />} />
      <Route path="/host-round" element={<HostRound />} />
      <Route path="/player/buzzer" element={<PlayerBuzzer />} />
      <Route path="/player/join" element={<JoinGame />} />
      <Route path="/player/team-selection" element={<TeamSelection />} />
      <Route path="/players-room" element={<PlayersRoom />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
