import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MagnifyingGlass, MusicNote, ListBullets, TrendUp, Play, Pause, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import type { SpotifyTrack, SpotifyPlaylist } from '@/lib/spotify'
import { 
  getUserTopTracks, 
  getUserPlaylists, 
  getPlaylistTracks, 
  searchTracks,
  formatTrackDisplay,
  formatDuration
} from '@/lib/spotify'

interface SpotifyTrackPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accessToken: string
  onTrackSelect: (track: SpotifyTrack) => void
}

export function SpotifyTrackPicker({
  open,
  onOpenChange,
  accessToken,
  onTrackSelect,
}: SpotifyTrackPickerProps) {
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([])
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([])
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('top')
  const [previewTrack, setPreviewTrack] = useState<SpotifyTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (open && accessToken) {
      loadInitialData()
    }
  }, [open, accessToken])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      stopPreview()
    }
  }, [open])

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
    setPreviewTrack(null)
    setCurrentTime(0)
    setDuration(0)
  }

  const togglePreview = (track: SpotifyTrack) => {
    if (!track.preview_url) {
      return
    }

    if (previewTrack?.id === track.id && isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(track.preview_url)
    audio.volume = 0.5
    audioRef.current = audio

    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setCurrentTime(0)
    })

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime)
    })

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
    })

    audio.play().catch(() => {
      setIsPlaying(false)
    })

    setPreviewTrack(track)
    setIsPlaying(true)
  }

  const loadInitialData = async () => {
    setLoading(true)
    try {
      const [tracks, lists] = await Promise.all([
        getUserTopTracks(accessToken),
        getUserPlaylists(accessToken),
      ])
      setTopTracks(tracks)
      setPlaylists(lists)
    } catch (error) {
      console.error('Failed to load Spotify data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setLoading(true)
    try {
      const results = await searchTracks(accessToken, searchQuery)
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePlaylistClick = async (playlistId: string) => {
    if (selectedPlaylist === playlistId) {
      setSelectedPlaylist(null)
      setPlaylistTracks([])
      return
    }

    setLoading(true)
    setSelectedPlaylist(playlistId)
    try {
      const tracks = await getPlaylistTracks(accessToken, playlistId)
      setPlaylistTracks(tracks)
    } catch (error) {
      console.error('Failed to load playlist tracks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTrackSelect = (track: SpotifyTrack) => {
    onTrackSelect(track)
    onOpenChange(false)
  }

  const TrackItem = ({ track, compact = false }: { track: SpotifyTrack; compact?: boolean }) => {
    const isPreviewPlaying = previewTrack?.id === track.id && isPlaying
    const hasPreview = !!track.preview_url
    const progress = isPreviewPlaying && duration > 0 ? (currentTime / duration) * 100 : 0

    return (
      <div
        className={`w-full glass-panel rounded-lg transition-all ${
          compact ? 'p-2' : 'p-3'
        } ${!compact && 'hover:border-accent'}`}
      >
        <div className="flex items-center gap-3">
          {!compact && track.album?.images?.[0] && (
            <img
              src={track.album.images[0].url}
              alt={track.album.name}
              className="w-12 h-12 rounded flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>
              {track.name}
            </div>
            <div className={`text-muted-foreground truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
            </div>
            {isPreviewPlaying && (
              <div className="mt-1.5 space-y-1">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                  <span>{formatDuration(currentTime * 1000)}</span>
                  <span>{formatDuration(duration * 1000)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`text-[10px] text-muted-foreground font-mono ${compact ? 'hidden' : ''}`}>
              {formatDuration(track.duration_ms)}
            </div>
            {hasPreview && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isPreviewPlaying ? 'text-accent' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  togglePreview(track)
                }}
              >
                {isPreviewPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
              </Button>
            )}
            {!hasPreview && (
              <div className="h-8 w-8 flex items-center justify-center">
                <SpeakerSlash size={14} className="text-muted-foreground opacity-50" />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleTrackSelect(track)}
            >
              <MusicNote size={18} className="text-accent" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-mono">Select Track</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="top" className="gap-2 text-xs">
              <TrendUp size={14} />
              Top Tracks
            </TabsTrigger>
            <TabsTrigger value="playlists" className="gap-2 text-xs">
              <ListBullets size={14} />
              Playlists
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-2 text-xs">
              <MagnifyingGlass size={14} />
              Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="top" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {loading && topTracks.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Loading your top tracks...
                </div>
              ) : topTracks.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No tracks found
                </div>
              ) : (
                <div className="space-y-2">
                  {topTracks.map((track) => (
                    <TrackItem key={track.id} track={track} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="playlists" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {loading && playlists.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Loading your playlists...
                </div>
              ) : playlists.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No playlists found
                </div>
              ) : (
                <div className="space-y-2">
                  {playlists.map((playlist) => (
                    <div key={playlist.id}>
                      <button
                        onClick={() => handlePlaylistClick(playlist.id)}
                        className={`w-full glass-panel p-3 rounded-lg text-left transition-all ${
                          selectedPlaylist === playlist.id
                            ? 'border-2 border-accent'
                            : 'hover:border-accent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {playlist.images?.[0] && (
                            <img
                              src={playlist.images[0].url}
                              alt={playlist.name}
                              className="w-12 h-12 rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {playlist.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {playlist.tracks?.total || 0} tracks
                            </div>
                          </div>
                          <ListBullets size={18} className="text-accent flex-shrink-0" />
                        </div>
                      </button>
                      
                      {selectedPlaylist === playlist.id && playlistTracks.length > 0 && (
                        <div className="ml-4 mt-2 space-y-1">
                          {playlistTracks.map((track) => (
                            <TrackItem key={track.id} track={track} compact />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="search" className="mt-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search for tracks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={!searchQuery.trim() || loading}>
                  <MagnifyingGlass size={18} />
                </Button>
              </div>

              <ScrollArea className="h-[350px] pr-4">
                {loading && searchResults.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    Searching...
                  </div>
                ) : searchResults.length === 0 && searchQuery ? (
                  <div className="text-center text-muted-foreground py-8">
                    No results found. Try a different search.
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    Enter a search query to find tracks
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((track) => (
                      <TrackItem key={track.id} track={track} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
