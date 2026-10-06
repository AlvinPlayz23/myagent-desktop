import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react'
import {
  Add01Icon,
  AddToListIcon,
  Alert02Icon,
  AlertCircleIcon,
  Archive01Icon,
  ArchiveRestoreIcon,
  ArrowDown02Icon,
  ArrowShrink01Icon,
  ArrowUp02Icon,
  BrainCircuitIcon,
  Cancel01Icon,
  CheckIcon,
  CheckmarkCircle02Icon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeSimpleIcon,
  ComputerTerminalIcon,
  Copy01Icon,
  CpuIcon,
  File01Icon,
  FileAddIcon,
  FileEditIcon,
  Edit01Icon,
  Download04Icon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  Globe02Icon,
  HelpCircleIcon,
  InformationCircleIcon,
  PaintBoardIcon,
  Pin02Icon,
  AiBrain01Icon,
  ArrowLeft01Icon,
  ViewIcon,
  ViewOffIcon,
  Delete02Icon,
  KeyboardIcon,
  MinusSignIcon,
  RefreshIcon,
  Robot01Icon,
  SidebarLeftIcon,
  Tick02Icon,
  UnfoldMoreIcon,
  Undo02Icon,
  Upload04Icon,
  Folder01Icon,
  Folder02Icon,
  FolderAddIcon,
  LayoutAlignLeftIcon,
  LayoutAlignRightIcon,
  Loading03Icon,
  Message01Icon,
  MoreHorizontalIcon,
  MouseLeftClick05Icon,
  MouseRightClick05Icon,
  PanelLeftOpenIcon,
  Rotate01Icon,
  Search01Icon,
  Settings01Icon,
  SparklesIcon,
  SquareIcon,
  SquarePen as SquarePenGlyph,
  Tick01Icon,
  Wrench01Icon
} from '@hugeicons/core-free-icons'

export type IconComponent = (props: Props) => JSX.Element

type Props = Omit<HugeiconsIconProps, 'icon'>

const makeIcon = (icon: HugeiconsIconProps['icon']): IconComponent => (props: Props): JSX.Element => (
  <HugeiconsIcon icon={icon} {...props} />
)

export const Add01 = makeIcon(Add01Icon)
export const AddToList = makeIcon(AddToListIcon)
export const Alert02 = makeIcon(Alert02Icon)
export const Archive01 = makeIcon(Archive01Icon)
export const ArchiveRestore = makeIcon(ArchiveRestoreIcon)
export const ArrowDown02 = makeIcon(ArrowDown02Icon)
export const ArrowShrink01 = makeIcon(ArrowShrink01Icon)
export const ArrowUp02 = makeIcon(ArrowUp02Icon)
export const BrainCircuit = makeIcon(BrainCircuitIcon)
export const Check = makeIcon(CheckIcon)
export const ChevronDown = makeIcon(ChevronDownIcon)
export const ChevronRight = makeIcon(ChevronRightIcon)
export const ComputerTerminal = makeIcon(ComputerTerminalIcon)
export const CodeSimple = makeIcon(CodeSimpleIcon)
export const Copy01 = makeIcon(Copy01Icon)
export const Cpu = makeIcon(CpuIcon)
export const File01 = makeIcon(File01Icon)
export const FileAdd = makeIcon(FileAddIcon)
export const FileEdit = makeIcon(FileEditIcon)
export const Edit01 = makeIcon(Edit01Icon)
export const Folder01 = makeIcon(Folder01Icon)
export const Folder02 = makeIcon(Folder02Icon)
export const FolderAdd = makeIcon(FolderAddIcon)
export const Globe02 = makeIcon(Globe02Icon)
export const Keyboard01 = makeIcon(KeyboardIcon)
export const GitBranch01 = makeIcon(GitBranchIcon)
export const GitCommit01 = makeIcon(GitCommitIcon)
export const GitPullRequest01 = makeIcon(GitPullRequestIcon)
export const Refresh01 = makeIcon(RefreshIcon)
export const Robot01 = makeIcon(Robot01Icon)
export const Undo01 = makeIcon(Undo02Icon)
export const ArrowDownTray = makeIcon(Download04Icon)
export const ArrowUpTray = makeIcon(Upload04Icon)
export const HelpCircle = makeIcon(HelpCircleIcon)
export const LayoutAlignLeft = makeIcon(LayoutAlignLeftIcon)
export const LayoutAlignRight = makeIcon(LayoutAlignRightIcon)
export const Loading03 = makeIcon(Loading03Icon)
export const Message01 = makeIcon(Message01Icon)
export const MoreHorizontal = makeIcon(MoreHorizontalIcon)
export const MouseLeftClick05 = makeIcon(MouseLeftClick05Icon)
export const MouseRightClick05 = makeIcon(MouseRightClick05Icon)
export const PanelLeftOpen = makeIcon(PanelLeftOpenIcon)
export const Pin02 = makeIcon(Pin02Icon)
export const Rotate01 = makeIcon(Rotate01Icon)
export const Search01 = makeIcon(Search01Icon)
export const Settings01 = makeIcon(Settings01Icon)
export const Sparkles = makeIcon(SparklesIcon)
export const Square = makeIcon(SquareIcon)
export const SquarePenIcon = makeIcon(SquarePenGlyph)
export const Tick01 = makeIcon(Tick01Icon)
export const Plus = makeIcon(Add01Icon)
export const Wrench01 = makeIcon(Wrench01Icon)
export const Cancel01 = makeIcon(Cancel01Icon)
export const ChevronLeft = makeIcon(ChevronLeftIcon)
export const ChevronUp = makeIcon(ChevronUpIcon)
export const UnfoldMore = makeIcon(UnfoldMoreIcon)
export const MinusSign = makeIcon(MinusSignIcon)
export const SidebarLeft = makeIcon(SidebarLeftIcon)
export const Tick02 = makeIcon(Tick02Icon)
export const InformationCircle = makeIcon(InformationCircleIcon)
export const PaintBoard = makeIcon(PaintBoardIcon)
export const AiBrain01 = makeIcon(AiBrain01Icon)
export const ArrowLeft01 = makeIcon(ArrowLeft01Icon)
export const View = makeIcon(ViewIcon)
export const ViewOff = makeIcon(ViewOffIcon)
export const Delete02 = makeIcon(Delete02Icon)
export const AlertCircle = makeIcon(AlertCircleIcon)
export const CheckmarkCircle02 = makeIcon(CheckmarkCircle02Icon)

/** Filled disc with a plus: the app-wide "new session" glyph. */
export function CirclePlus({ size = 18, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-foreground/15 text-foreground ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Plus size={Math.round(size * 0.6)} strokeWidth={2} />
    </span>
  )
}
