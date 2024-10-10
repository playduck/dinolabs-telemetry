function tooltipPlugin(opts) {
    let over, bound, bLeft, bTop;

    function syncBounds() {
        let bbox = over.getBoundingClientRect();
        bLeft = bbox.left;
        bTop = bbox.top;
    }

    const overlay = document.createElement("div");
    overlay.id = "overlay";
    overlay.style.display = "none";
    overlay.style.position = "absolute";
    document.body.appendChild(overlay);

    return {
        hooks: {
            init: u => {
                over = u.over;

                bound = over;

                over.onmouseenter = () => {
                    overlay.style.display = "block";
                };

                over.onmouseleave = () => {
                    overlay.style.display = "none";
                };
            },
            setSize: u => {
                syncBounds();
            },
            setCursor: u => {
                const { left, top, idx } = u.cursor;
                const x = u.data[0][idx];
                const y = u.data[1][idx];
                const anchor = { left: left + bLeft, top: top - bTop };
                overlay.textContent = `${x}, ${y}`;
                placement(overlay, anchor, "right", "start", { bound });
            }
        }
    };
}
