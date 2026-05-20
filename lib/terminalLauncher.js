// Liste de candidats terminal emulator -> argv à exécuter pour ouvrir une
// commande dans une fenêtre, avec un shell persistant après le programme
// (pour qu'on puisse lire la sortie / continuer dedans). Ordonné par
// préférence subjective. Pure : ne fait pas d'IO, juste construit l'argv.

const SHELL_KEEP = (cmd) => `${cmd}; exec "${'${SHELL:-bash}'}"`;

// Chaque entrée prend une commande shell et renvoie un argv complet.
// argv[0] est le binaire à chercher dans $PATH.
export function candidateArgvs(cmd) {
    const keep = SHELL_KEEP(cmd);
    return [
        ['ptyxis', '--new-window', '--', 'sh', '-c', keep],
        ['gnome-terminal', '--', 'sh', '-c', keep],
        ['kgx', '--', 'sh', '-c', keep],
        ['ghostty', '-e', 'sh', '-c', keep],
        ['foot', 'sh', '-c', keep],
        ['kitty', 'sh', '-c', keep],
        ['alacritty', '-e', 'sh', '-c', keep],
        ['wezterm', 'start', '--', 'sh', '-c', keep],
        ['konsole', '-e', 'sh', '-c', keep],
        ['tilix', '-e', 'sh', '-c', keep],
        ['xterm', '-e', 'sh', '-c', keep],
    ];
}
