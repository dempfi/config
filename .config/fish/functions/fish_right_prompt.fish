function fish_right_prompt
    set -l status_copy $status

    if test "$CMD_DURATION" -gt 20
        set -l duration (echo $CMD_DURATION | humanize_duration)
        set -l duration_color 777

        if test "$CMD_DURATION" -gt 2000
            set duration_color red
        end

        if test ! -z "$duration"
            printf (set_color $duration_color)"$duration "(set_color normal)
        end
    end

    if test $status_copy -ne 0
        printf (set_color red)"→ $status_copy "(set_color normal)
    end
end

