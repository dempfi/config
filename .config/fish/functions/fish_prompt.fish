function fish_prompt
  set -l status_copy $status
  set -l status_color normal

  # set -l cwd (echo "$PWD" | sed -E "
  #   s|.+/(.+)/(.+)|\1/\2|
  #   s|$HOME||
  #   s|$USER/||
  # ")

  # set -l cwd_dir (dirname $cwd)
  # set -l cwd_base (basename $cwd)

  # if test "$cwd_dir" = . -o "$cwd_dir" = /
  #   set -e cwd_dir
  # else
  #   set cwd_dir (set_color white)"$cwd_dir "(set_color normal)
  # end

  set -l branch_name
  set -l branch_color green

  if set branch_name "("(git_branch_name)")"

    set -l git_remote_status

    # TODO: Re-enable after adding $eco_remote_update_delay global to save CPU
    # if test -z "$git_right_status" -o "$git_right_status" = "∧"
    #   if not test (jobs -l)
    #     command git remote update > /dev/null ^ /dev/null &
    #     set git_remote_status "&"
    #   end
    # end

    set -l git_status

    if git_is_staged
      if git_is_dirty
        set git_status "± "
      else
        set git_status "+ "
      end
    else if git_is_dirty
      set git_status "╍ "
    end

    if git_is_touched
      set branch_color yellow
    end

    if git_is_detached_head
      set branch_color red
      set branch_name "→$branch_name"
    end

    set -l git_right_status (
      command git rev-list --left-right --count 'HEAD...@{upstream}' | awk '
        $1 > 0 { print "↑ "$1 }
        $2 > 0 { print "↓ "$2 }
    ')


    if git_is_stashed
      set git_right_status (
        command git stash list 2>/dev/null | wc -l | awk '$1 > 0 { print "⟀"$1 }'
      )" $git_right_status"
    end

    set branch_name "$git_status"(set_color -o $branch_color)"$branch_name$git_remote_status"(
      set_color normal)

    if test ! -z "$git_right_status"
      set branch_name "$branch_name $git_right_status"
    end
  end

  if test "$status_copy" -ne 0
    set status_color F33
  end

  printf (set_color ABB0B6)(prompt_pwd)" "(set_color normal)

  if test ! -z "$branch_name"
    printf "$branch_name "
  end

  if test ! -z "$cwd_base"
    printf (set_color ABB0B6)"$cwd_base "(set_color normal)
  end

  printf (set_color $status_color)"-> "(set_color normal)
end
