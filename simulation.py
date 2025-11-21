import numpy as np

def ease_out(t):
    # cubic-bezier(0, 0, 0.2, 1) approximation: 1 - (1-t)^3? 
    # Actually standard CSS ease-out is cubic-bezier(0, 0, 0.58, 1).
    # Tailwind ease-out is cubic-bezier(0, 0, 0.2, 1) ? No, standard is (0, 0, 1, 1) linear? No.
    # Let's assume 1 - (1-t)^3 for simplicity of "ease out".
    t = np.clip(t, 0, 1)
    return 1 - (1 - t) ** 3

def simulate(duration_grid=1.0, duration_trans=0.8, delay_trans=0.1, 
             h_top=250, h_bottom=400, dist_trans=40):
    
    dt = 0.01
    times = np.arange(0, 1.5, dt)
    
    drift_total = (h_bottom - h_top) / 2 # Positive = Upward drift (Screen coords decrease)
    # Actually, if bottom is taller, Center moves UP (negative Y).
    # So Drift is -75px (UP).
    drift_amount = -drift_total
    
    # Top Element (Title):
    # Relative to bar: moves UP (-Y) from 0 height to -h_top height.
    # Plus Drift (moves UP -Y).
    # Plus Transform (moves UP from +40 to 0 relative to flow). 
    # Transform: starts at +40, goes to 0. So delta is -40.
    
    # Center is 0.
    # Top Edge of Bar is 0.
    # Top Element position relative to Center = -Height(t) + TransformOffset(t) + Drift(t)
    # Wait, Center moves. Let's stick to Screen Coordinates relative to Initial Center.
    
    # Grid Expansion curve
    grid_progress = ease_out(times / duration_grid)
    
    # Current Heights
    curr_h_top = h_top * grid_progress
    curr_h_bottom = h_bottom * grid_progress
    
    # Current Center Position (Bar)
    # Initial: 0.
    # Final: (h_top - h_bottom) / 2 ?
    # No. Total height H = Ht + Hb.
    # Center of H is at H/2 from top of block.
    # Bar is at Ht from top of block.
    # So Bar is at Ht - H/2 = Ht - (Ht+Hb)/2 = (Ht - Hb)/2.
    # If Ht=250, Hb=400. Bar is at (250-400)/2 = -75.
    # So Bar moves from 0 to -75 (UP).
    
    bar_pos = (curr_h_top - curr_h_bottom) / 2
    
    # Top Element Visual Position (assuming centered in Top Section? No, simple flow).
    # Let's assume Top Element is near the bottom of Top Section (closest to Bar).
    # e.g. Title.
    # Pos relative to Bar = -Margin - ElementHeight/2. Constant if full expanded.
    # But during expansion, where is it?
    # "grid-template-rows" animation usually clips content. 
    # Content stays in place relative to top of grid cell? Or bottom?
    # If "align-items: center" is not on the grid cell, it's top.
    # But the parent is "flex center".
    
    # Let's assume the Content is anchored to the Bar for the visual effect we want.
    # But in reality, if it's top-aligned in the Top Section:
    # Pos relative to Top Edge of Top Section = Constant.
    # Top Edge of Top Section = BarPos - CurrHeightTop.
    # So Pos = BarPos - CurrHeightTop + Offset.
    
    # Transform Effect
    # trans_progress starts at delay_trans, lasts duration_trans.
    t_rel = (times - delay_trans) / duration_trans
    trans_progress = ease_out(t_rel)
    # Top: translateY(40px -> 0). Visual Y adds (40 * (1-progress)).
    trans_offset_top = 40 * (1 - trans_progress)
    
    # Bottom Element (Subtitle)
    # Top-aligned in Bottom Section.
    # Pos relative to Bar = BarPos + Offset.
    # (Since it's just below the bar).
    
    # Transform Effect Bottom
    # Bottom: translateY(-40px -> 0). Visual Y adds (-40 * (1-progress)).
    trans_offset_bottom = -40 * (1 - trans_progress)
    
    # Visual Positions (relative to initial center 0)
    # Top Item (approx anchored to bottom of top section? No, usually top section flows down, 
    # but flex-direction col-reverse? No.
    # If it's top aligned in top section, it moves UP fast.
    # If it's bottom aligned in top section, it stays near Bar.
    # The user said "Reigh... coming UP from there".
    
    # Let's assume they are symmetrically placed around the bar final state.
    # Final Top Pos = BarFinal - Y_dist.
    # Final Bottom Pos = BarFinal + Y_dist.
    
    # Motion Top:
    # If anchored to Top of Top Section:
    # y_top = (BarPos - curr_h_top) + trans_offset_top.
    # If anchored to Bottom of Top Section (e.g. flex-end):
    # y_top = BarPos + trans_offset_top. (Moves with bar).
    
    # The Grid animation on "grid-template-rows" with "overflow-hidden" acts like a reveal mask.
    # The content usually sits at the top of the box?
    # If box grows 0->100, and content is at top, content moves with top edge.
    # If container is centered, top edge moves UP.
    
    # So:
    # y_top = BarPos - curr_h_top/2 (if centered in top section) + trans_offset_top?
    # Let's assume content is effectively at the "revealing edge" or "moving edge".
    
    # Let's try to match Velocities.
    # V_top_net = V_bar - V_expansion_top + V_trans_up
    # V_btm_net = V_bar + V_expansion_btm? No, if anchored to top of bottom section, it moves with Bar.
    # y_btm = BarPos + trans_offset_bottom.
    
    # Wait! If Bottom element is at the top of the Bottom Section.
    # It's position is just BarPos + Margin.
    # So it moves with the Bar (Drift).
    # y_btm(t) = BarPos(t) + trans_offset_bottom(t).
    
    # Top Element: Is it at the bottom of Top Section?
    # Structure:
    # Top Section -> Div -> Div -> Icon, Title.
    # It's just a Div. Default alignment is Top.
    # So Top Element is at the TOP of the Top Section.
    # y_top(t) = (BarPos(t) - curr_h_top(t)) + trans_offset_top(t).
    
    # Let's check this asymmetry.
    # Bottom Element: Moves with Bar (Drift).
    # Top Element: Moves with Top Edge (Drift - Expansion).
    
    # This is HUGE asymmetry.
    # Top Element moves UP by (Drift + Expansion).
    # Bottom Element moves UP by Drift. (And down by Transform).
    
    # V_top ~ -75 - 250 = -325px (UP).
    # V_btm ~ -75 = -75px (UP).
    
    # This explains why Top feels "Shooting Up" and Bottom feels "Stuck".
    
    # To fix this, we want Bottom to move DOWN (positive Y) or Top to move UP slower.
    # But we can't change layout expansion.
    
    # Actually, is it Top Aligned?
    # <div className="flex items-center justify-center ...">
    #   <div className="text-center w-full"> ... </div>
    # </div>
    # The Top Section is a child of "max-w-4xl mx-auto".
    # Top Section contents are just block elements.
    # So inside Top Section, content is at the Top.
    
    # If we want Top Content to move FROM THE BAR, we should align it to the BOTTOM of the Top Section during animation.
    # But we can't easily change alignment during animation without CSS flip.
    
    # BUT, the user asked for TIMING adjustments.
    # If Top is super fast (325px move) and Bottom is slow/drifting (75px move).
    # We want to match their perceived motion.
    
    # Maybe the user WANTS them to look like they come from the bar.
    # Currently Top comes from "Top of Screen" basically (as it expands).
    # Bottom comes from Bar.
    
    # If we want to match alignment.
    # We should calculate the effective offset needed.
    
    # But if we are restricted to "calculate how to adjust timing".
    # We can't fix the spatial trajectory with timing.
    
    # Let's reconsider the "40px" constraint. "keep the positions exactly as you are".
    # Maybe they meant "keep the CSS translate(40px) as is" but I can add other CSS?
    
    # If I cannot change layout.
    # I have to calculate duration/delay such that the visual "start" and "end" feel similar?
    # Impossible if one moves 300px and other moves 50px.
    
    # Wait,  animation.
    # If I change the Top Section to be ?
    # Then the content would stick to the bottom (the Bar) as it grows.
    # Then y_top = BarPos - Margin.
    # Then both Top and Bottom elements would move with the Bar (Drift).
    # y_top = BarPos + trans_offset_top.
    # y_btm = BarPos + trans_offset_bottom.
    # This would be PERFECT SYMMETRY (except for the Bar drift, which affects both equally).
    
    # PROPOSAL: Change Top Section to .
    # This is a layout change, but keeps "positions" (final layout) same?
    # Yes, if height is auto/1fr, justify-end just pushes content to bottom.
    # In the final state, the grid is '1fr', likely sized to fit content perfectly?
    # If '1fr' is "auto", then justify-end doesn't matter (content fills).
    # But if '1fr' is expanding from 0, and we want content to appear "from the bar",
    # we MUST anchor it to the bar.
    
    print("Recommendation: Anchor content to the Bar.")

simulate()
