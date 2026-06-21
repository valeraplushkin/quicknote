use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

use crate::windows;

pub fn setup(app: &AppHandle) -> Result<(), tauri::Error> {
    let create = MenuItem::with_id(app, "create", "Создать заметку", true, None::<&str>)?;
    let list = MenuItem::with_id(app, "list", "Список заметок", true, None::<&str>)?;
    // "Настройки" window is Etap 3; for now opens the notes list as a placeholder.
    let settings = MenuItem::with_id(app, "settings", "Настройки", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&create, &list, &settings, &sep, &quit])?;

    let icon = app
        .default_window_icon()
        .ok_or(tauri::Error::AssetNotFound("tray icon".into()))?
        .clone();

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("QuickNote")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "create" => windows::show_capture(app),
            "list" => windows::show_notes_list(app),
            "settings" => windows::show_notes_list(app), // stub until Etap 3
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
