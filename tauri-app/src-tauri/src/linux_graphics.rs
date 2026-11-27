pub(super) fn needs_compatible_graphics(release: &str) -> bool {
    let value = |key| {
        release
            .lines()
            .filter_map(|line| line.split_once('='))
            .find(|(name, _)| *name == key)
            .map(|(_, value)| value.trim_matches(['"', '\'']))
    };
    value("ID") == Some("linuxmint")
        && value("VERSION_ID")
            .and_then(|version| version.split('.').next())
            .and_then(|major| major.parse::<u32>().ok())
            .is_some_and(|major| major >= 27)
}
