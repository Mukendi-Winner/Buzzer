import appLogo from '../assets/Host_UI_Logo.png'

function AppLogo({ className = '', alt = 'Club Genie en Herbe' }) {
  return <img className={className} src={appLogo} alt={alt} />
}

export default AppLogo
