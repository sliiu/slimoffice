export interface SlideshowSetupState {
    loop: boolean;
    windowed: boolean;
    presenter: boolean;
    useTimings: boolean;
    playNarrations: boolean;
    /** 放映时是否显示嵌入视频的播放控件（HTML5 controls）。默认 true。 */
    showMediaControls: boolean;
}
export declare function openSetupSlideShowDialog(doc: Document, state: SlideshowSetupState, onApply: (next: SlideshowSetupState) => void): void;
