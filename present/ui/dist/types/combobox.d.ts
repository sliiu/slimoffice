export interface ComboboxItem {
    value: string;
    label?: string;
}
export interface BindComboboxOptions {
    options?: Array<string | ComboboxItem>;
    onChange?: (value: string) => void;
    optionStyle?: (item: ComboboxItem) => string | undefined;
    allowCustom?: boolean;
}
export interface ComboboxHandle {
    el: HTMLElement;
    input: HTMLInputElement;
    setOptions: (options: Array<string | ComboboxItem>) => void;
    setValue: (value: string) => void;
    destroy: () => void;
}
export declare function bindCombobox(input: HTMLInputElement, opts?: BindComboboxOptions): ComboboxHandle;
