import { getProviderLogo, getProviderTitle } from '@shared/utils/provider.utils'

interface ProvidersAvatarProps {
  provider: string;
  size?: number;
}

const ProvidersAvatar = ({ provider, size = 24 }: ProvidersAvatarProps) => {
  const logo = getProviderLogo(provider)
  const title = getProviderTitle(provider)

  return logo ? (
    <img
      src={logo}
      alt={`${title} - Logo`}
      className={`object-contain rounded-full${provider === 'xai' ? ' dark:invert' : ''}`}
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
      className="flex rounded-full border border-paper-400 items-center justify-center bg-paper-100"
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <p className="text-xs font-semibold leading-none capitalize text-paper-700">
        {title.charAt(0)}
      </p>
    </div>
  )
}

export default ProvidersAvatar
