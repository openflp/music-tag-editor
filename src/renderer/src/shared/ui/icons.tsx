import { forwardRef, type ComponentProps, type ForwardRefExoticComponent, type RefAttributes } from 'react'
import {
  IconAlertOctagon,
  IconBadge,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconArrowsShuffle,
  IconCalendarPlus,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheck,
  IconCircleX,
  IconClipboard,
  IconClock,
  IconCopy,
  IconCut,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFile,
  IconFilePlus,
  IconFilter,
  IconBrandGithub,
  IconBug,
  IconFolder,
  IconFolderShare,
  IconHash,
  IconHelp,
  IconKeyboard,
  IconHourglass,
  IconInfoCircle,
  IconLayoutBottombarCollapse,
  IconLayoutBottombarExpand,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutGrid,
  IconList,
  IconLoader2,
  IconLogout,
  IconMusic,
  IconNotes,
  IconPhoto,
  IconPin,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconPlus,
  IconPlaylistX,
  IconRefresh,
  IconReload,
  IconRestore,
  IconRepeat,
  IconRepeatOnce,
  IconSearch,
  IconSelectAll,
  IconTextCaption,
  IconSelector,
  IconSettings,
  IconSortAscendingLetters,
  IconTrash,
  IconUpload,
  IconFileDownload,
  IconUser,
  IconVolume,
  IconVolumeOff,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset
} from '@tabler/icons-react'

/** Толщина контура. Одно значение на весь набор. */
const STROKE = 2

type Glyph = typeof IconMusic
export type AppIconProps = ComponentProps<Glyph>

type AppIcon = ForwardRefExoticComponent<AppIconProps & RefAttributes<SVGSVGElement>>

function icon(Glyph: Glyph, size = 16, stroke = STROKE): AppIcon {
  const AppIcon = forwardRef<SVGSVGElement, AppIconProps>(function AppIcon(
    { size: next = size, stroke: width = stroke, ...props },
    ref
  ) {
    return <Glyph ref={ref} size={next} stroke={width} aria-hidden="true" {...props} />
  })
  AppIcon.displayName = Glyph.displayName
  return AppIcon
}

export const NoteIcon = icon(IconMusic)
export const SettingsIcon = icon(IconSettings)
export const SearchIcon = icon(IconSearch)
export const GithubIcon = icon(IconBrandGithub, 14)
export const RefreshIcon = icon(IconRefresh)
export const ClearResultsIcon = icon(IconCircleX)
export const OpenExternalIcon = icon(IconExternalLink)
export const FileIcon = icon(IconFile)
export const PlusIcon = icon(IconPlus)
export const FolderOutIcon = icon(IconFolderShare)
export const FolderIcon = icon(IconFolder)
export const NumberIcon = icon(IconHash)
export const FilePlusIcon = icon(IconFilePlus)
export const FilterIcon = icon(IconFilter)
export const SortNameIcon = icon(IconSortAscendingLetters)
export const CreatedIcon = icon(IconCalendarPlus)
export const ModifiedIcon = icon(IconClock)
export const DurationIcon = icon(IconHourglass)
export const OrderIcon = icon(IconList)
export const ArtistIcon = icon(IconUser)
export const ChevronUpIcon = icon(IconChevronUp)
export const ChevronDownIcon = icon(IconChevronDown)
export const ChevronRightIcon = icon(IconChevronRight)
export const MoreIcon = icon(IconDots)
export const CheckIcon = icon(IconCheck)
export const AlertIcon = icon(IconAlertTriangle)
export const TriangleAlertIcon = AlertIcon
export const CloseIcon = icon(IconX, 14)
export const XIcon = CloseIcon
export const HelpIcon = icon(IconHelp, 14)
export const DownloadIcon = icon(IconDownload)
export const EyeIcon = icon(IconEye)
export const ImageIcon = icon(IconPhoto)
export const TrashIcon = icon(IconTrash)
export const CopyIcon = icon(IconCopy)
export const CutIcon = icon(IconCut)
export const PasteIcon = icon(IconClipboard)
export const SelectAllIcon = icon(IconSelectAll)
export const UndoIcon = icon(IconArrowBackUp)
export const RedoIcon = icon(IconArrowForwardUp)
export const RestoreIcon = icon(IconRestore)
export const ExpandIcon = icon(IconArrowsMaximize)
export const ShrinkIcon = icon(IconArrowsMinimize)
export const CoverIcon = icon(IconPhoto)
export const UploadIcon = icon(IconUpload, 30)
export const ImportIcon = icon(IconUpload)
export const SampleIcon = icon(IconFileDownload)
export const ComboIcon = icon(IconSelector, 14)
export const ArrowLeftIcon = icon(IconArrowLeft, 14)
export const ArrowRightIcon = icon(IconArrowRight, 14)
export const YearPrevIcon = icon(IconChevronLeft, 14)
export const YearNextIcon = icon(IconChevronRight, 14)
export const VolumeIcon = icon(IconVolume)
export const VolumeOffIcon = icon(IconVolumeOff)
export const PlayIcon = icon(IconPlayerPlayFilled, 16, 0)
export const PauseIcon = icon(IconPlayerPauseFilled, 16, 0)
export const StopIcon = icon(IconPlayerStopFilled, 16, 0)

/** Обновление и стоп лежат друг на друге и перетекают, а не сменяются кадром. */
export function RefreshStopIcon({ stop }: { stop: boolean }) {
  return (
    <span className={stop ? 'icon-swap is-stop' : 'icon-swap'}>
      <RefreshIcon />
      <StopIcon />
    </span>
  )
}
export const ShuffleIcon = icon(IconArrowsShuffle)
export const RepeatIcon = icon(IconRepeat)
export const RepeatOneIcon = icon(IconRepeatOnce)
export const SkipPrevIcon = icon(IconPlayerSkipBackFilled, 18, 0)
export const SkipNextIcon = icon(IconPlayerSkipForwardFilled, 18, 0)
export const MenuIcon = forwardRef<SVGSVGElement, Omit<AppIconProps, 'size' | 'stroke'>>(function MenuIcon(props, ref) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 9"
      fill="none"
      aria-hidden="true"
      {...props}
      width={12}
      height={9}
    >
      <path d="M0 0.5h12M0 4.5h12M0 8.5h12" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
})
export const ClearListIcon = icon(IconPlaylistX)
export const QuitIcon = icon(IconLogout)
export const PinIcon = icon(IconPin)
export const ZoomInIcon = icon(IconZoomIn)
export const ZoomOutIcon = icon(IconZoomOut)
export const ZoomResetIcon = icon(IconZoomReset)
export const ReloadIcon = icon(IconReload)
export const KeyboardIcon = icon(IconKeyboard)
export const BugIcon = icon(IconBug)
export const SectionsIcon = icon(IconLayoutGrid)
export const NotesIcon = icon(IconNotes)
export const LyricsIcon = icon(IconTextCaption)
export const BadgeIcon = icon(IconBadge)
export const CircleCheckIcon = icon(IconCircleCheck)
export const InfoIcon = icon(IconInfoCircle)
export const OctagonXIcon = icon(IconAlertOctagon)
export const Loader2Icon = icon(IconLoader2)

export const SidebarIcon = forwardRef<SVGSVGElement, AppIconProps & { off?: boolean }>(function SidebarIcon(
  { off = false, size = 16, stroke = STROKE, ...props },
  ref
) {
  const Glyph = off ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse
  return <Glyph ref={ref} size={size} stroke={stroke} aria-hidden="true" {...props} />
})

export const PlayerToggleIcon = forwardRef<SVGSVGElement, AppIconProps & { off?: boolean }>(function PlayerToggleIcon(
  { off = false, size = 16, stroke = STROKE, ...props },
  ref
) {
  const Glyph = off ? IconLayoutBottombarExpand : IconLayoutBottombarCollapse
  return <Glyph ref={ref} size={size} stroke={stroke} aria-hidden="true" {...props} />
})