import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react'
import { Globe2, Keyboard, GitBranch, GitCommitVertical, GitPullRequestArrow, RefreshCw, Undo2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import {
  Add01Icon,
  AddToListIcon,
  Alert02Icon,
  Archive01Icon,
  ArchiveRestoreIcon,
  ArrowDown02Icon,
  ArrowShrink01Icon,
  ArrowUp02Icon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ComputerTerminalIcon,
  Copy01Icon,
  CpuIcon,
  File01Icon,
  FileAddIcon,
  FileEditIcon,
  Edit01Icon,
  Folder01Icon,
  Folder02Icon,
  FolderAddIcon,
  LayoutAlignLeftIcon,
  LayoutAlignRightIcon,
  Loading03Icon,
  Message01Icon,
  MoreHorizontalIcon,
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
export const Copy01 = makeIcon(Copy01Icon)
export const Cpu = makeIcon(CpuIcon)
export const File01 = makeIcon(File01Icon)
export const FileAdd = makeIcon(FileAddIcon)
export const FileEdit = makeIcon(FileEditIcon)
export const Edit01 = makeIcon(Edit01Icon)
export const Folder01 = makeIcon(Folder01Icon)
export const Folder02 = makeIcon(Folder02Icon)
export const FolderAdd = makeIcon(FolderAddIcon)
export const Globe02 = Globe2
export const Keyboard01 = Keyboard
export const GitBranch01 = GitBranch
export const GitCommit01 = GitCommitVertical
export const GitPullRequest01 = GitPullRequestArrow
export const Refresh01 = RefreshCw
export const Undo01 = Undo2
export const ArrowDownTray = ArrowDownToLine
export const ArrowUpTray = ArrowUpFromLine
export const LayoutAlignLeft = makeIcon(LayoutAlignLeftIcon)
export const LayoutAlignRight = makeIcon(LayoutAlignRightIcon)
export const Loading03 = makeIcon(Loading03Icon)
export const Message01 = makeIcon(Message01Icon)
export const MoreHorizontal = makeIcon(MoreHorizontalIcon)
export const PanelLeftOpen = makeIcon(PanelLeftOpenIcon)
export const Rotate01 = makeIcon(Rotate01Icon)
export const Search01 = makeIcon(Search01Icon)
export const Settings01 = makeIcon(Settings01Icon)
export const Sparkles = makeIcon(SparklesIcon)
export const Square = makeIcon(SquareIcon)
export const SquarePenIcon = makeIcon(SquarePenGlyph)
export const Tick01 = makeIcon(Tick01Icon)
export const Plus = makeIcon(Add01Icon)
export const Wrench01 = makeIcon(Wrench01Icon)
