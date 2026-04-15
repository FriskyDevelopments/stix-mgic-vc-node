import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MagnifyingGlass, MusicNote, ListBullets, TrendUp } from '@phosphor-icons/react'
import type { SpotifyTrack, SpotifyPlaylist } from '@/lib/spotify'
import { 
  getUserTopTracks, 
  getUserPlaylists, 
  getPlaylistTracks, 
  searchTracks,
  formatTrackDisplay 
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

  useEffect(() => {
    if (open && accessToken) {
      loadInitialData()
    }
  }, [open, accessToken])

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
                    <button
                      key={track.id}
                      onClick={() => handleTrackSelect(track)}
                      className="w-full glass-panel p-3 rounded-lg text-left hover:border-accent transition-all"
                    >
                      <div className="flex items-center gap-3">
                        {track.album?.images?.[0] && (
                          <img
                            src={track.album.images[0].url}
                            alt={track.album.name}
                            className="w-12 h-12 rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {track.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
                          </div>
                        </div>
                        <MusicNote size={18} className="text-accent flex-shrink-0" />
                      </div>
                    </button>
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
                            <button
                              key={track.id}
                              onClick={() => handleTrackSelect(track)}
                              className="w-full glass-panel p-2 rounded text-left hover:border-accent transition-all"
                            >
                              <div className="flex items-center gap-2">
                                <MusicNote size={14} className="text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs truncate">{track.name}</div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
                                  </div>
                                </div>
                              </div>
                            </button>
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
                      <button
                        key={track.id}
                        onClick={() => handleTrackSelect(track)}
                        className="w-full glass-panel p-3 rounded-lg text-left hover:border-accent transition-all"
                      >
                        <div className="flex items-center gap-3">
                          {track.album?.images?.[0] && (
                            <img
                              src={track.album.images[0].url}
                              alt={track.album.name}
                              className="w-12 h-12 rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {track.name}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
                            </div>
                          </div>
                          <MusicNote size={18} className="text-accent flex-shrink-0" />
                        </div>
                      </button>
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
