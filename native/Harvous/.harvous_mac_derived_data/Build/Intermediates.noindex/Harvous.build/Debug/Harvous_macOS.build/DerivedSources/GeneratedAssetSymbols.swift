import Foundation
#if canImport(DeveloperToolsSupport)
import DeveloperToolsSupport
#endif

#if SWIFT_PACKAGE
private let resourceBundle = Foundation.Bundle.module
#else
private class ResourceBundleClass {}
private let resourceBundle = Foundation.Bundle(for: ResourceBundleClass.self)
#endif

// MARK: - Color Symbols -

@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
extension DeveloperToolsSupport.ColorResource {

}

// MARK: - Image Symbols -

@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
extension DeveloperToolsSupport.ImageResource {

    /// The "Harvous.ArrowLeft" asset catalog image resource.
    static let harvousArrowLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowLeft", bundle: resourceBundle)

    /// The "Harvous.ArrowRight" asset catalog image resource.
    static let harvousArrowRight = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowRight", bundle: resourceBundle)

    /// The "Harvous.ArrowRightArrowLeft" asset catalog image resource.
    static let harvousArrowRightArrowLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowRightArrowLeft", bundle: resourceBundle)

    /// The "Harvous.ArrowRotateLeft" asset catalog image resource.
    static let harvousArrowRotateLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowRotateLeft", bundle: resourceBundle)

    /// The "Harvous.ArrowRotateRight" asset catalog image resource.
    static let harvousArrowRotateRight = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowRotateRight", bundle: resourceBundle)

    /// The "Harvous.ArrowUpRight" asset catalog image resource.
    static let harvousArrowUpRight = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowUpRight", bundle: resourceBundle)

    /// The "Harvous.ArrowsLeftRight" asset catalog image resource.
    static let harvousArrowsLeftRight = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowsLeftRight", bundle: resourceBundle)

    /// The "Harvous.ArrowsRotate" asset catalog image resource.
    static let harvousArrowsRotate = DeveloperToolsSupport.ImageResource(name: "Harvous.ArrowsRotate", bundle: resourceBundle)

    /// The "Harvous.Bars" asset catalog image resource.
    static let harvousBars = DeveloperToolsSupport.ImageResource(name: "Harvous.Bars", bundle: resourceBundle)

    /// The "Harvous.BookFilled" asset catalog image resource.
    static let harvousBookFilled = DeveloperToolsSupport.ImageResource(name: "Harvous.BookFilled", bundle: resourceBundle)

    /// The "Harvous.BookOpen" asset catalog image resource.
    static let harvousBookOpen = DeveloperToolsSupport.ImageResource(name: "Harvous.BookOpen", bundle: resourceBundle)

    /// The "Harvous.Bookmark" asset catalog image resource.
    static let harvousBookmark = DeveloperToolsSupport.ImageResource(name: "Harvous.Bookmark", bundle: resourceBundle)

    /// The "Harvous.BoxArchive" asset catalog image resource.
    static let harvousBoxArchive = DeveloperToolsSupport.ImageResource(name: "Harvous.BoxArchive", bundle: resourceBundle)

    /// The "Harvous.Camera" asset catalog image resource.
    static let harvousCamera = DeveloperToolsSupport.ImageResource(name: "Harvous.Camera", bundle: resourceBundle)

    /// The "Harvous.CardsFilled" asset catalog image resource.
    static let harvousCardsFilled = DeveloperToolsSupport.ImageResource(name: "Harvous.CardsFilled", bundle: resourceBundle)

    /// The "Harvous.Check" asset catalog image resource.
    static let harvousCheck = DeveloperToolsSupport.ImageResource(name: "Harvous.Check", bundle: resourceBundle)

    /// The "Harvous.ChevronDown" asset catalog image resource.
    static let harvousChevronDown = DeveloperToolsSupport.ImageResource(name: "Harvous.ChevronDown", bundle: resourceBundle)

    /// The "Harvous.ChevronLeft" asset catalog image resource.
    static let harvousChevronLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.ChevronLeft", bundle: resourceBundle)

    /// The "Harvous.ChevronRight" asset catalog image resource.
    static let harvousChevronRight = DeveloperToolsSupport.ImageResource(name: "Harvous.ChevronRight", bundle: resourceBundle)

    /// The "Harvous.ChevronUp" asset catalog image resource.
    static let harvousChevronUp = DeveloperToolsSupport.ImageResource(name: "Harvous.ChevronUp", bundle: resourceBundle)

    /// The "Harvous.Church" asset catalog image resource.
    static let harvousChurch = DeveloperToolsSupport.ImageResource(name: "Harvous.Church", bundle: resourceBundle)

    /// The "Harvous.CircleArrowLeft" asset catalog image resource.
    static let harvousCircleArrowLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleArrowLeft", bundle: resourceBundle)

    /// The "Harvous.CircleCheck" asset catalog image resource.
    static let harvousCircleCheck = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleCheck", bundle: resourceBundle)

    /// The "Harvous.CircleDot" asset catalog image resource.
    static let harvousCircleDot = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleDot", bundle: resourceBundle)

    /// The "Harvous.CircleInfo" asset catalog image resource.
    static let harvousCircleInfo = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleInfo", bundle: resourceBundle)

    /// The "Harvous.CircleMinus" asset catalog image resource.
    static let harvousCircleMinus = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleMinus", bundle: resourceBundle)

    /// The "Harvous.CircleQuestion" asset catalog image resource.
    static let harvousCircleQuestion = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleQuestion", bundle: resourceBundle)

    /// The "Harvous.CircleXmark" asset catalog image resource.
    static let harvousCircleXmark = DeveloperToolsSupport.ImageResource(name: "Harvous.CircleXmark", bundle: resourceBundle)

    /// The "Harvous.ClockRotateLeft" asset catalog image resource.
    static let harvousClockRotateLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.ClockRotateLeft", bundle: resourceBundle)

    /// The "Harvous.CodeBranch" asset catalog image resource.
    static let harvousCodeBranch = DeveloperToolsSupport.ImageResource(name: "Harvous.CodeBranch", bundle: resourceBundle)

    /// The "Harvous.Comments" asset catalog image resource.
    static let harvousComments = DeveloperToolsSupport.ImageResource(name: "Harvous.Comments", bundle: resourceBundle)

    /// The "Harvous.CreditCard" asset catalog image resource.
    static let harvousCreditCard = DeveloperToolsSupport.ImageResource(name: "Harvous.CreditCard", bundle: resourceBundle)

    /// The "Harvous.Crosshairs" asset catalog image resource.
    static let harvousCrosshairs = DeveloperToolsSupport.ImageResource(name: "Harvous.Crosshairs", bundle: resourceBundle)

    /// The "Harvous.Cube" asset catalog image resource.
    static let harvousCube = DeveloperToolsSupport.ImageResource(name: "Harvous.Cube", bundle: resourceBundle)

    /// The "Harvous.Ellipsis" asset catalog image resource.
    static let harvousEllipsis = DeveloperToolsSupport.ImageResource(name: "Harvous.Ellipsis", bundle: resourceBundle)

    /// The "Harvous.Envelope" asset catalog image resource.
    static let harvousEnvelope = DeveloperToolsSupport.ImageResource(name: "Harvous.Envelope", bundle: resourceBundle)

    /// The "Harvous.Eraser" asset catalog image resource.
    static let harvousEraser = DeveloperToolsSupport.ImageResource(name: "Harvous.Eraser", bundle: resourceBundle)

    /// The "Harvous.FileCirclePlus" asset catalog image resource.
    static let harvousFileCirclePlus = DeveloperToolsSupport.ImageResource(name: "Harvous.FileCirclePlus", bundle: resourceBundle)

    /// The "Harvous.Folder" asset catalog image resource.
    static let harvousFolder = DeveloperToolsSupport.ImageResource(name: "Harvous.Folder", bundle: resourceBundle)

    /// The "Harvous.Gear" asset catalog image resource.
    static let harvousGear = DeveloperToolsSupport.ImageResource(name: "Harvous.Gear", bundle: resourceBundle)

    /// The "Harvous.Globe" asset catalog image resource.
    static let harvousGlobe = DeveloperToolsSupport.ImageResource(name: "Harvous.Globe", bundle: resourceBundle)

    /// The "Harvous.HardDrive" asset catalog image resource.
    static let harvousHardDrive = DeveloperToolsSupport.ImageResource(name: "Harvous.HardDrive", bundle: resourceBundle)

    /// The "Harvous.Heading" asset catalog image resource.
    static let harvousHeading = DeveloperToolsSupport.ImageResource(name: "Harvous.Heading", bundle: resourceBundle)

    /// The "Harvous.Heart" asset catalog image resource.
    static let harvousHeart = DeveloperToolsSupport.ImageResource(name: "Harvous.Heart", bundle: resourceBundle)

    /// The "Harvous.Highlight" asset catalog image resource.
    static let harvousHighlight = DeveloperToolsSupport.ImageResource(name: "Harvous.Highlight", bundle: resourceBundle)

    /// The "Harvous.Home" asset catalog image resource.
    static let harvousHome = DeveloperToolsSupport.ImageResource(name: "Harvous.Home", bundle: resourceBundle)

    /// The "Harvous.Image" asset catalog image resource.
    static let harvous = DeveloperToolsSupport.ImageResource(name: "Harvous.Image", bundle: resourceBundle)

    /// The "Harvous.ImagesMulti" asset catalog image resource.
    static let harvousImagesMulti = DeveloperToolsSupport.ImageResource(name: "Harvous.ImagesMulti", bundle: resourceBundle)

    /// The "Harvous.Indent" asset catalog image resource.
    static let harvousIndent = DeveloperToolsSupport.ImageResource(name: "Harvous.Indent", bundle: resourceBundle)

    /// The "Harvous.Key" asset catalog image resource.
    static let harvousKey = DeveloperToolsSupport.ImageResource(name: "Harvous.Key", bundle: resourceBundle)

    /// The "Harvous.Keyboard" asset catalog image resource.
    static let harvousKeyboard = DeveloperToolsSupport.ImageResource(name: "Harvous.Keyboard", bundle: resourceBundle)

    /// The "Harvous.LayoutSidebarLeft" asset catalog image resource.
    static let harvousLayoutSidebarLeft = DeveloperToolsSupport.ImageResource(name: "Harvous.LayoutSidebarLeft", bundle: resourceBundle)

    /// The "Harvous.LayoutSidebarRight" asset catalog image resource.
    static let harvousLayoutSidebarRight = DeveloperToolsSupport.ImageResource(name: "Harvous.LayoutSidebarRight", bundle: resourceBundle)

    /// The "Harvous.LinesLeaning" asset catalog image resource.
    static let harvousLinesLeaning = DeveloperToolsSupport.ImageResource(name: "Harvous.LinesLeaning", bundle: resourceBundle)

    /// The "Harvous.Link" asset catalog image resource.
    static let harvousLink = DeveloperToolsSupport.ImageResource(name: "Harvous.Link", bundle: resourceBundle)

    /// The "Harvous.ListOl" asset catalog image resource.
    static let harvousListOl = DeveloperToolsSupport.ImageResource(name: "Harvous.ListOl", bundle: resourceBundle)

    /// The "Harvous.ListUl" asset catalog image resource.
    static let harvousListUl = DeveloperToolsSupport.ImageResource(name: "Harvous.ListUl", bundle: resourceBundle)

    /// The "Harvous.LocationDot" asset catalog image resource.
    static let harvousLocationDot = DeveloperToolsSupport.ImageResource(name: "Harvous.LocationDot", bundle: resourceBundle)

    /// The "Harvous.Lock" asset catalog image resource.
    static let harvousLock = DeveloperToolsSupport.ImageResource(name: "Harvous.Lock", bundle: resourceBundle)

    /// The "Harvous.MagnifyingGlass" asset catalog image resource.
    static let harvousMagnifyingGlass = DeveloperToolsSupport.ImageResource(name: "Harvous.MagnifyingGlass", bundle: resourceBundle)

    /// The "Harvous.Minus" asset catalog image resource.
    static let harvousMinus = DeveloperToolsSupport.ImageResource(name: "Harvous.Minus", bundle: resourceBundle)

    /// The "Harvous.Note" asset catalog image resource.
    static let harvousNote = DeveloperToolsSupport.ImageResource(name: "Harvous.Note", bundle: resourceBundle)

    /// The "Harvous.Outdent" asset catalog image resource.
    static let harvousOutdent = DeveloperToolsSupport.ImageResource(name: "Harvous.Outdent", bundle: resourceBundle)

    /// The "Harvous.PenToSquare" asset catalog image resource.
    static let harvousPenToSquare = DeveloperToolsSupport.ImageResource(name: "Harvous.PenToSquare", bundle: resourceBundle)

    /// The "Harvous.Pencil" asset catalog image resource.
    static let harvousPencil = DeveloperToolsSupport.ImageResource(name: "Harvous.Pencil", bundle: resourceBundle)

    /// The "Harvous.Person" asset catalog image resource.
    static let harvousPerson = DeveloperToolsSupport.ImageResource(name: "Harvous.Person", bundle: resourceBundle)

    /// The "Harvous.Plus" asset catalog image resource.
    static let harvousPlus = DeveloperToolsSupport.ImageResource(name: "Harvous.Plus", bundle: resourceBundle)

    /// The "Harvous.Reply" asset catalog image resource.
    static let harvousReply = DeveloperToolsSupport.ImageResource(name: "Harvous.Reply", bundle: resourceBundle)

    /// The "Harvous.Shapes" asset catalog image resource.
    static let harvousShapes = DeveloperToolsSupport.ImageResource(name: "Harvous.Shapes", bundle: resourceBundle)

    /// The "Harvous.ShareSquare" asset catalog image resource.
    static let harvousShareSquare = DeveloperToolsSupport.ImageResource(name: "Harvous.ShareSquare", bundle: resourceBundle)

    /// The "Harvous.Star" asset catalog image resource.
    static let harvousStar = DeveloperToolsSupport.ImageResource(name: "Harvous.Star", bundle: resourceBundle)

    /// The "Harvous.TableCells" asset catalog image resource.
    static let harvousTableCells = DeveloperToolsSupport.ImageResource(name: "Harvous.TableCells", bundle: resourceBundle)

    /// The "Harvous.Tag" asset catalog image resource.
    static let harvousTag = DeveloperToolsSupport.ImageResource(name: "Harvous.Tag", bundle: resourceBundle)

    /// The "Harvous.Thumbtack" asset catalog image resource.
    static let harvousThumbtack = DeveloperToolsSupport.ImageResource(name: "Harvous.Thumbtack", bundle: resourceBundle)

    /// The "Harvous.ThumbtackSlash" asset catalog image resource.
    static let harvousThumbtackSlash = DeveloperToolsSupport.ImageResource(name: "Harvous.ThumbtackSlash", bundle: resourceBundle)

    /// The "Harvous.Trash" asset catalog image resource.
    static let harvousTrash = DeveloperToolsSupport.ImageResource(name: "Harvous.Trash", bundle: resourceBundle)

    /// The "Harvous.UserFilled" asset catalog image resource.
    static let harvousUserFilled = DeveloperToolsSupport.ImageResource(name: "Harvous.UserFilled", bundle: resourceBundle)

    /// The "Harvous.UserPlus" asset catalog image resource.
    static let harvousUserPlus = DeveloperToolsSupport.ImageResource(name: "Harvous.UserPlus", bundle: resourceBundle)

    /// The "Harvous.Users" asset catalog image resource.
    static let harvousUsers = DeveloperToolsSupport.ImageResource(name: "Harvous.Users", bundle: resourceBundle)

    /// The "Harvous.WandMagicSparkles" asset catalog image resource.
    static let harvousWandMagicSparkles = DeveloperToolsSupport.ImageResource(name: "Harvous.WandMagicSparkles", bundle: resourceBundle)

    /// The "Harvous.Wrench" asset catalog image resource.
    static let harvousWrench = DeveloperToolsSupport.ImageResource(name: "Harvous.Wrench", bundle: resourceBundle)

    /// The "Harvous.Xmark" asset catalog image resource.
    static let harvousXmark = DeveloperToolsSupport.ImageResource(name: "Harvous.Xmark", bundle: resourceBundle)

    /// The "HarvousAppIcon" asset catalog image resource.
    static let harvousAppIcon = DeveloperToolsSupport.ImageResource(name: "HarvousAppIcon", bundle: resourceBundle)

}

