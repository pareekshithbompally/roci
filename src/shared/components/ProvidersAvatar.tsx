import { getProviderLogo, getProviderTitle } from '@shared/utils/provider.utils'

interface ProvidersAvatarProps {
  provider: string;
  size?: number;
}

export const ProvidersAvatar = ({ provider, size = 24 }: ProvidersAvatarProps) => {
  const logo = getProviderLogo(provider)
  const title = getProviderTitle(provider)

  return logo ? (
    <img
      src={logo}
      alt={`${title} - Logo`}
      className="object-contain rounded-full"
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

