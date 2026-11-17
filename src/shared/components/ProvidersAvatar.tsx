import { getProviderApp, getProviderLogo, getProviderTitle } from '@shared/utils/provider.utils'
import { useAppIcon } from './AppIcon'
import { DeviceIcon } from './DeviceIcon'
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config'

interface ProvidersAvatarProps {
  provider: string;
  size?: number;
}

export const ProvidersAvatar = ({ provider, size = 24 }: ProvidersAvatarProps) => {
  if (provider === LOCAL_MODELS_CONFIG.provider.id) return <DeviceIcon size={size} />
  return <ProviderLogo provider={provider} size={size} />
}

/** A provider's logo: its local server's Mac app icon when installed, else its logo, else its initial. */
const ProviderLogo = ({ provider, size }: Required<ProvidersAvatarProps>) => {
  // A local server's own Mac app icon when it's installed (drawn by macOS), else the provider's logo.
  const appIcon = useAppIcon(getProviderApp(provider))
  const logo = appIcon ?? getProviderLogo(provider)
  const title = getProviderTitle(provider)

  return logo ? (
    <img
      src={logo}
      alt={`${title} - Logo`}
      className={appIcon ? 'object-contain' : 'object-contain rounded-full'}
      style={{
        imageRendering: '-webkit-optimize-contrast',
        width: `${size}px`,
        height: `${size}px`,
      }}
      loading="eager"
      decoding="sync"
      draggable={false}
    />
  ) : (
    <div
      className="flex rounded-full items-center justify-center bg-layer-2 shadow-input"
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <p className="text-callout font-semibold leading-none capitalize text-muted">
        {title.charAt(0)}
      </p>
    </div>
  )
}

