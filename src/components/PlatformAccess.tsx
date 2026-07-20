import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ShieldCheck,
  SignIn,
  SignOut,
  CheckCircle,
  WarningCircle,
  Broadcast,
  User,
} from "@phosphor-icons/react"
import type {
  PlatformAuthStatus,
  TelegramUser,
  DiscordUser,
} from "@/lib/auth"
import {
  formatTelegramUsername,
  formatDiscordUsername,
  getTelegramPhotoUrl,
  getDiscordAvatarUrl,
} from "@/lib/auth"

interface PlatformAccessProps {
  telegramStatus: PlatformAuthStatus
  telegramUser: TelegramUser | null
  telegramError: string | null
  discordStatus: PlatformAuthStatus
  discordUser: DiscordUser | null
  discordError: string | null
  onTelegramAuth: () => void
  onTelegramDisconnect: () => void
  onDiscordAuth: () => void
  onDiscordDisconnect: () => void
}

export function PlatformAccess({
  telegramStatus,
  telegramUser,
  telegramError,
  discordStatus,
  discordUser,
  discordError,
  onTelegramAuth,
  onTelegramDisconnect,
  onDiscordAuth,
  onDiscordDisconnect,
}: PlatformAccessProps) {
  const getStatusBadge = (status: PlatformAuthStatus, _error: string | null) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="outline" className="gap-1.5 border-success text-success text-[10px] font-mono">
            <CheckCircle size={10} weight="fill" />
            CONNECTED
          </Badge>
        )
      case 'connecting':
        return (
          <Badge variant="outline" className="gap-1.5 border-primary text-primary text-[10px] font-mono animate-pulse-glow">
            <Broadcast size={10} weight="fill" />
            CONNECTING
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="outline" className="gap-1.5 border-destructive text-destructive text-[10px] font-mono">
            <WarningCircle size={10} weight="fill" />
            ERROR
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="gap-1.5 border-muted-foreground text-muted-foreground text-[10px] font-mono">
            <ShieldCheck size={10} />
            NOT CONNECTED
          </Badge>
        )
    }
  }

  return (
    <div className="glass-panel rounded-xl p-6 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-primary" />
          <h2 className="text-lg font-semibold">Platform Access</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Platform identity for operator session binding. Real Discord/Telegram verification runs through the control-plane API when secrets are configured.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`glass-panel p-4 rounded-lg transition-all ${
          telegramStatus === 'connected'
            ? 'border-2 border-success/30 bg-success/5'
            : 'border border-border'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${
                  telegramStatus === 'connected' ? 'bg-success/20' : 'bg-muted'
                }`}>
                  <Broadcast size={18} className={
                    telegramStatus === 'connected' ? 'text-success' : 'text-foreground'
                  } weight="fill" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Telegram</h3>
                  <p className="text-xs text-muted-foreground">VC session eligible</p>
                </div>
              </div>
              {getStatusBadge(telegramStatus, telegramError)}
            </div>

            {telegramStatus === 'connected' && telegramUser && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Avatar className="h-10 w-10 border-2 border-success/30">
                    <AvatarImage src={getTelegramPhotoUrl(telegramUser)} />
                    <AvatarFallback>
                      <User size={20} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {formatTelegramUsername(telegramUser)}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      ID: {telegramUser.id}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-accent space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={12} weight="fill" />
                    <span>Mock operator identity loaded</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={12} weight="fill" />
                    <span>Demo VC binding only — not production</span>
                  </div>
                </div>
                <Button
                  onClick={onTelegramDisconnect}
                  variant="ghost"
                  size="sm"
                  className="w-full gap-2 text-xs"
                >
                  <SignOut size={14} />
                  Disconnect Platform
                </Button>
              </div>
            )}

            {telegramStatus === 'error' && telegramError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="text-xs text-destructive">{telegramError}</p>
              </div>
            )}

            {telegramStatus === 'disconnected' && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• Telegram account binding</div>
                  <div>• VC session authorization</div>
                  <div>• Operator identity verification</div>
                </div>
                <Button
                  onClick={onTelegramAuth}
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                >
                  <SignIn size={16} />
                  Authorize Telegram
                </Button>
              </div>
            )}

            {telegramStatus === 'connecting' && (
              <div className="py-6 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Authorizing platform access...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`glass-panel p-4 rounded-lg transition-all ${
          discordStatus === 'connected'
            ? 'border-2 border-success/30 bg-success/5'
            : 'border border-border'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${
                  discordStatus === 'connected' ? 'bg-success/20' : 'bg-muted'
                }`}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 71 55"
                    fill="none"
                    className={discordStatus === 'connected' ? 'fill-success' : 'fill-foreground'}
                  >
                    <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Discord</h3>
                  <p className="text-xs text-muted-foreground">Channel relay available</p>
                </div>
              </div>
              {getStatusBadge(discordStatus, discordError)}
            </div>

            {discordStatus === 'connected' && discordUser && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Avatar className="h-10 w-10 border-2 border-success/30">
                    <AvatarImage src={getDiscordAvatarUrl(discordUser)} />
                    <AvatarFallback>
                      <User size={20} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {formatDiscordUsername(discordUser)}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      ID: {discordUser.id}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-accent space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={12} weight="fill" />
                    <span>Mock operator identity loaded</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={12} weight="fill" />
                    <span>Demo channel binding only — not production</span>
                  </div>
                </div>
                <Button
                  onClick={onDiscordDisconnect}
                  variant="ghost"
                  size="sm"
                  className="w-full gap-2 text-xs"
                >
                  <SignOut size={14} />
                  Disconnect Platform
                </Button>
              </div>
            )}

            {discordStatus === 'error' && discordError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="text-xs text-destructive">{discordError}</p>
              </div>
            )}

            {discordStatus === 'disconnected' && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• Discord account binding</div>
                  <div>• Voice channel authorization</div>
                  <div>• Operator identity verification</div>
                </div>
                <Button
                  onClick={onDiscordAuth}
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                >
                  <SignIn size={16} />
                  Authorize Discord
                </Button>
              </div>
            )}

            {discordStatus === 'connecting' && (
              <div className="py-6 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Authorizing platform access...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel p-4 rounded-lg bg-muted/20 border border-accent/20">
        <p className="text-xs text-muted-foreground text-center">
          <span className="text-accent font-medium">Control-plane auth</span>
          {' '}— Discord OAuth and Telegram Login Widget verify through the API when secrets are set; otherwise demo identity is used for local UX.
        </p>
      </div>
    </div>
  )
}
